pipeline {
    agent any

    environment {
        IMAGE_REPOSITORY = 'localhost:5001/taskflow-api'
        STAGING_PORT     = '3000'
        PROD_PORT        = '4000'

        PATH = "/opt/homebrew/bin:/Users/anshumanjadav/.docker/bin:/usr/local/bin:/usr/bin:/bin:${env.PATH}"

        SONAR_TOKEN = credentials('sonar-api-token')
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        // ============================================================
        // 1. BUILD
        // ============================================================
        stage('Build') {
            steps {
                echo '========== BUILD STAGE =========='

                sh '''
                    set -e

                    echo "Node version:"
                    node --version

                    echo "npm version:"
                    npm --version

                    echo "Docker version:"
                    docker --version

                    echo "Installing dependencies..."
                    npm ci

                    echo "Running application build..."
                    npm run build

                    echo "Building Docker image..."
                    docker build \
                        -t ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                        -t ${IMAGE_REPOSITORY}:latest \
                        .

                    echo "Pushing build artifact to local registry..."
                    docker push ${IMAGE_REPOSITORY}:${BUILD_NUMBER}
                    docker push ${IMAGE_REPOSITORY}:latest

                    echo "Build artifact created successfully."
                    docker image inspect ${IMAGE_REPOSITORY}:${BUILD_NUMBER} >/dev/null
                '''
            }

            post {
                success {
                    echo "Build artifact: ${IMAGE_REPOSITORY}:${BUILD_NUMBER}"
                }
            }
        }

        // ============================================================
        // 2. TEST
        // ============================================================
        stage('Test') {
            steps {
                echo '========== TEST STAGE =========='

                sh '''
                    set -e

                    echo "Running automated unit and integration tests..."
                    npm test
                '''
            }

            post {
                always {
                    junit 'reports/junit.xml'

                    archiveArtifacts(
                        artifacts: 'coverage/**',
                        allowEmptyArchive: true
                    )
                }
            }
        }

        // ============================================================
        // 3. CODE QUALITY
        // ============================================================
        stage('Code Quality') {
            steps {
                echo '========== CODE QUALITY STAGE =========='

                sh '''
                    set -e

                    echo "Running ESLint..."
                    npm run lint
                '''

                withSonarQubeEnv('SonarQube') {
                    sh '''
                        set -e

                        echo "Running SonarCloud analysis..."

                        sonar-scanner \
                          -Dsonar.token="$SONAR_TOKEN" \
                          -Dsonar.qualitygate.wait=true
                    '''
                }
            }
        }

        // ============================================================
        // 4. SECURITY
        // ============================================================
        stage('Security') {
            steps {
                echo '========== SECURITY STAGE =========='

                sh '''
                    set -e

                    echo "Running npm dependency security audit..."
                    npm audit --audit-level=high --json > npm-audit-report.json

                    echo "Running Trivy filesystem scan..."
                    trivy fs \
                        --scanners vuln \
                        --severity HIGH,CRITICAL \
                        --exit-code 1 \
                        --format json \
                        --output trivy-fs-report.json \
                        .

                    echo "Running Trivy Docker image scan..."
                    trivy image \
                        --severity HIGH,CRITICAL \
                        --exit-code 1 \
                        --format json \
                        --output trivy-image-report.json \
                        ${IMAGE_REPOSITORY}:${BUILD_NUMBER}

                    echo "Security scans passed."
                '''
            }

            post {
                always {
                    archiveArtifacts(
                        artifacts: '*-report.json',
                        allowEmptyArchive: true
                    )
                }
            }
        }

        // ============================================================
        // 5. DEPLOY
        // ============================================================
        stage('Deploy') {
            steps {
                echo '========== DEPLOY STAGE =========='
                echo "Deploying build ${BUILD_NUMBER} to staging..."

                withCredentials([
                    string(
                        credentialsId: 'taskflow-staging-jwt',
                        variable: 'STAGING_JWT_SECRET'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "Pulling exact tested build artifact..."
                        docker pull ${IMAGE_REPOSITORY}:${BUILD_NUMBER}

                        echo "Deploying to staging..."
                        ENV=staging \
                        PORT=${STAGING_PORT} \
                        IMAGE_NAME=${IMAGE_REPOSITORY} \
                        TAG=${BUILD_NUMBER} \
                        APP_VERSION=1.0.${BUILD_NUMBER} \
                        JWT_SECRET="${STAGING_JWT_SECRET}" \
                        docker compose up -d taskflow-api

                        echo "Waiting for staging deployment to become healthy..."

                        for i in $(seq 1 12); do
                            if curl -fsS http://localhost:${STAGING_PORT}/health; then
                                echo
                                echo "Staging deployment is healthy."
                                exit 0
                            fi

                            echo "Staging health check attempt ${i}/12 failed."
                            echo "Waiting 5 seconds..."
                            sleep 5
                        done

                        echo "Staging deployment health check failed."

                        echo "Attempting rollback to previous build..."

                        PREVIOUS_BUILD=$((BUILD_NUMBER - 1))

                        if [ "${PREVIOUS_BUILD}" -gt 0 ] && \
                           docker image inspect ${IMAGE_REPOSITORY}:${PREVIOUS_BUILD} >/dev/null 2>&1; then

                            echo "Rolling back to build ${PREVIOUS_BUILD}..."

                            ENV=staging \
                            PORT=${STAGING_PORT} \
                            IMAGE_NAME=${IMAGE_REPOSITORY} \
                            TAG=${PREVIOUS_BUILD} \
                            APP_VERSION=1.0.${PREVIOUS_BUILD} \
                            JWT_SECRET="${STAGING_JWT_SECRET}" \
                            docker compose up -d taskflow-api

                        else
                            echo "No previous local build artifact available for rollback."
                        fi

                        exit 1
                    '''
                }
            }
        }

        // ============================================================
        // 6. RELEASE
        // ============================================================
        stage('Release') {
            steps {
                echo '========== RELEASE STAGE =========='
                echo "Promoting build ${BUILD_NUMBER} to production..."

                withCredentials([
                    string(
                        credentialsId: 'taskflow-production-jwt',
                        variable: 'PRODUCTION_JWT_SECRET'
                    )
                ]) {
                    sh '''
                        set -e

                        RELEASE_VERSION="1.0.${BUILD_NUMBER}"
                        RELEASE_TAG="release-${RELEASE_VERSION}"
                        GIT_TAG="v${RELEASE_VERSION}"

                        echo "Promoting the exact tested image..."
                        echo "Source image:"
                        echo "${IMAGE_REPOSITORY}:${BUILD_NUMBER}"

                        echo "Release image:"
                        echo "${IMAGE_REPOSITORY}:${RELEASE_TAG}"

                        docker pull ${IMAGE_REPOSITORY}:${BUILD_NUMBER}

                        docker tag \
                            ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                            ${IMAGE_REPOSITORY}:${RELEASE_TAG}

                        docker push ${IMAGE_REPOSITORY}:${RELEASE_TAG}

                        echo "Release image created successfully."

                        docker image inspect \
                            ${IMAGE_REPOSITORY}:${RELEASE_TAG} >/dev/null

                        echo "Creating Git release tag ${GIT_TAG}..."

                        git config user.name "Jenkins"
                        git config user.email "jenkins@localhost"

                        git tag -a \
                            "${GIT_TAG}" \
                            -m "Release ${RELEASE_VERSION}" \
                            "${GIT_COMMIT}"

                        echo "Pushing Git release tag..."

                        git remote set-url \
                            origin \
                            https://github.com/Anshuman3311/TaskFlow-DevOps-Pipeline.git

                        withCredentials([
                            gitUsernamePassword(
                                credentialsId: 'github-push-credentials',
                                gitToolName: 'git'
                            )
                        ]) {
                            sh 'git push origin "${GIT_TAG}"'
                        }

                        echo "Git release tag pushed successfully."

                        echo "Deploying release to production..."

                        ENV=production \
                        PORT=${PROD_PORT} \
                        IMAGE_NAME=${IMAGE_REPOSITORY} \
                        TAG=${RELEASE_TAG} \
                        APP_VERSION=${RELEASE_VERSION} \
                        JWT_SECRET="${PRODUCTION_JWT_SECRET}" \
                        docker compose up -d taskflow-api

                        echo "Waiting for production release to become healthy..."

                        for i in $(seq 1 12); do
                            if curl -fsS http://localhost:${PROD_PORT}/health; then
                                echo
                                echo "Production release is healthy."
                                exit 0
                            fi

                            echo "Production health check attempt ${i}/12 failed."
                            echo "Waiting 5 seconds..."
                            sleep 5
                        done

                        echo "Production release health check failed."

                        echo "Attempting production rollback..."

                        PREVIOUS_BUILD=$((BUILD_NUMBER - 1))
                        PREVIOUS_RELEASE_TAG="release-1.0.${PREVIOUS_BUILD}"

                        if [ "${PREVIOUS_BUILD}" -gt 0 ] && \
                           docker image inspect ${IMAGE_REPOSITORY}:${PREVIOUS_RELEASE_TAG} >/dev/null 2>&1; then

                            echo "Rolling back production to ${PREVIOUS_RELEASE_TAG}..."

                            ENV=production \
                            PORT=${PROD_PORT} \
                            IMAGE_NAME=${IMAGE_REPOSITORY} \
                            TAG=${PREVIOUS_RELEASE_TAG} \
                            APP_VERSION=1.0.${PREVIOUS_BUILD} \
                            JWT_SECRET="${PRODUCTION_JWT_SECRET}" \
                            docker compose up -d taskflow-api

                        else
                            echo "No previous release artifact available for rollback."
                        fi

                        exit 1
                    '''
                }
            }
        }

        // ============================================================
        // 7. MONITORING
        // ============================================================
        stage('Monitoring') {
            steps {
                echo '========== MONITORING & ALERTING STAGE =========='

                sh '''
                    set -e

                    echo "Checking production health endpoint..."
                    curl -fsS http://localhost:${PROD_PORT}/health

                    echo
                    echo "Checking Prometheus metrics endpoint..."
                    curl -fsS http://localhost:${PROD_PORT}/metrics > /tmp/taskflow-metrics.txt

                    echo "Metrics endpoint is available."

                    echo "Checking Prometheus service..."
                    curl -fsS http://localhost:9090/-/healthy

                    echo
                    echo "Production monitoring checks passed."
                '''
            }
        }
    }

    post {
        failure {
            echo 'Pipeline failed - see the stage logs above for details.'
        }

        success {
            echo 'Pipeline completed successfully - all seven DevOps stages passed.'
        }

        always {
            cleanWs()
        }
    }
}
