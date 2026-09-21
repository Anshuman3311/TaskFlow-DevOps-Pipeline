pipeline {
    agent any

    environment {
        // =====================================================
        // Application / Docker configuration
        // =====================================================
        IMAGE_REPOSITORY = 'localhost:5001/taskflow-api'

        STAGING_PORT = '3000'
        PROD_PORT = '4000'

        // =====================================================
        // SonarCloud configuration
        // =====================================================
        SONAR_PROJECT_KEY = 'Anshuman3311_TaskFlow-DevOps-Pipeline'
        SONAR_ORGANIZATION = 'anshuman3311'

        // =====================================================
        // macOS Jenkins PATH
        //
        // Jenkins does not inherit the interactive Terminal PATH.
        // Explicitly expose Node/npm, Docker Desktop CLI and Trivy.
        // =====================================================
        PATH = "/opt/homebrew/bin:/Users/anshumanjadav/.docker/bin:/usr/local/bin:/usr/bin:/bin:${env.PATH}"
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        // =====================================================
        // STAGE 1 - BUILD
        // =====================================================
        stage('Build') {
            steps {
                echo '========== BUILD STAGE =========='

                sh '''
                    set -e

                    echo "Checking required build tools..."
                    node --version
                    npm --version
                    docker --version

                    echo "Installing dependencies..."
                    npm ci

                    echo "Running application build..."
                    npm run build

                    echo "Building Docker image..."

                    docker build \
                        -t ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                        -t ${IMAGE_REPOSITORY}:1.0.${BUILD_NUMBER} \
                        .

                    echo "Pushing versioned build artifact..."

                    docker push ${IMAGE_REPOSITORY}:${BUILD_NUMBER}
                    docker push ${IMAGE_REPOSITORY}:1.0.${BUILD_NUMBER}

                    echo "Build artifact created:"
                    echo "  ${IMAGE_REPOSITORY}:${BUILD_NUMBER}"
                    echo "  ${IMAGE_REPOSITORY}:1.0.${BUILD_NUMBER}"
                '''
            }

            post {
                success {
                    echo "Build completed successfully."
                    echo "Docker artifact version: 1.0.${BUILD_NUMBER}"
                }
            }
        }


        // =====================================================
        // STAGE 2 - TEST
        // =====================================================
        stage('Test') {
            steps {
                echo '========== TEST STAGE =========='

                sh '''
                    set -e

                    echo "Running automated test suite..."

                    NODE_ENV=test npm test
                '''
            }

            post {
                always {
                    junit(
                        testResults: 'reports/junit.xml',
                        allowEmptyResults: false
                    )

                    archiveArtifacts(
                        artifacts: 'coverage/**',
                        allowEmptyArchive: true,
                        fingerprint: true
                    )
                }
            }
        }


        // =====================================================
        // STAGE 3 - CODE QUALITY
        // =====================================================
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
                            -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                            -Dsonar.organization=${SONAR_ORGANIZATION} \
                            -Dsonar.qualitygate.wait=true \
                            -Dsonar.qualitygate.timeout=300
                    '''
                }
            }
        }


        // =====================================================
        // STAGE 4 - SECURITY
        // =====================================================
        stage('Security') {
            steps {
                echo '========== SECURITY STAGE =========='

                sh '''
                    set -e

                    echo "Running npm dependency security audit..."

                    npm audit \
                        --audit-level=high \
                        --json > npm-audit-report.json

                    echo "Running Trivy container vulnerability scan..."

                    trivy image \
                        --scanners vuln \
                        --severity HIGH,CRITICAL \
                        --ignore-unfixed \
                        --exit-code 1 \
                        ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                        --format json \
                        --output trivy-report.json

                    echo "Security scan completed successfully."
                    echo "No HIGH or CRITICAL vulnerabilities detected."
                '''
            }

            post {
                always {
                    archiveArtifacts(
                        artifacts: 'npm-audit-report.json,trivy-report.json',
                        allowEmptyArchive: true,
                        fingerprint: true
                    )
                }
            }
        }


        // =====================================================
        // STAGE 5 - DEPLOY
        // =====================================================
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

                        echo "Waiting for staging application to become healthy..."

                        for i in $(seq 1 12); do

                            if curl -fsS \
                                http://localhost:${STAGING_PORT}/health; then

                                echo
                                echo "Staging deployment is healthy."
                                exit 0
                            fi

                            echo
                            echo "Health check attempt ${i}/12 failed."
                            echo "Waiting 5 seconds..."

                            sleep 5
                        done

                        echo "Staging deployment failed."

                        echo "Attempting rollback..."

                        PREVIOUS_BUILD=$((BUILD_NUMBER - 1))

                        if docker image inspect \
                            ${IMAGE_REPOSITORY}:${PREVIOUS_BUILD} \
                            >/dev/null 2>&1; then

                            echo "Rolling back to build ${PREVIOUS_BUILD}..."

                            ENV=staging \
                            PORT=${STAGING_PORT} \
                            IMAGE_NAME=${IMAGE_REPOSITORY} \
                            TAG=${PREVIOUS_BUILD} \
                            APP_VERSION=1.0.${PREVIOUS_BUILD} \
                            JWT_SECRET="${STAGING_JWT_SECRET}" \
                            docker compose up -d taskflow-api

                            echo "Rollback completed."

                        else
                            echo "No previous build artifact available for rollback."
                        fi

                        exit 1
                    '''
                }
            }
        }


        // =====================================================
        // STAGE 6 - RELEASE
        // =====================================================
        stage('Release') {

            steps {
                echo '========== RELEASE STAGE =========='
                echo "Promoting build ${BUILD_NUMBER} to production..."

                withCredentials([
                    string(
                        credentialsId: 'taskflow-production-jwt',
                        variable: 'PRODUCTION_JWT_SECRET'
                    ),

                    usernamePassword(
                        credentialsId: 'github-push-credentials',
                        usernameVariable: 'GIT_USERNAME',
                        passwordVariable: 'GIT_PASSWORD'
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

                        docker pull \
                            ${IMAGE_REPOSITORY}:${BUILD_NUMBER}

                        docker tag \
                            ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                            ${IMAGE_REPOSITORY}:${RELEASE_TAG}

                        docker push \
                            ${IMAGE_REPOSITORY}:${RELEASE_TAG}

                        echo "Release image created successfully."

                        docker image inspect \
                            ${IMAGE_REPOSITORY}:${RELEASE_TAG} \
                            >/dev/null

                        echo "Creating Git release tag ${GIT_TAG}..."

                        git config user.name "Jenkins"
                        git config user.email "jenkins@localhost"

                        git tag -a \
                            "${GIT_TAG}" \
                            -m "Release ${RELEASE_VERSION}" \
                            "${GIT_COMMIT}"

                        echo "Pushing Git release tag..."

                        git push \
                            https://${GIT_USERNAME}:${GIT_PASSWORD}@github.com/Anshuman3311/TaskFlow-DevOps-Pipeline.git \
                            "${GIT_TAG}"

                        echo "Deploying release artifact to production..."

                        ENV=production \
                        PORT=${PROD_PORT} \
                        IMAGE_NAME=${IMAGE_REPOSITORY} \
                        TAG=${RELEASE_TAG} \
                        APP_VERSION=${RELEASE_VERSION} \
                        JWT_SECRET="${PRODUCTION_JWT_SECRET}" \
                        docker compose up -d taskflow-api

                        echo "Waiting for production application..."

                        for i in $(seq 1 12); do

                            if curl -fsS \
                                http://localhost:${PROD_PORT}/health; then

                                echo
                                echo "Production release is healthy."
                                exit 0
                            fi

                            echo
                            echo "Production health check attempt ${i}/12 failed."
                            echo "Waiting 5 seconds..."

                            sleep 5
                        done

                        echo "Production deployment failed."
                        exit 1
                    '''
                }
            }
        }


        // =====================================================
        // STAGE 7 - MONITORING
        // =====================================================
        stage('Monitoring') {
            steps {
                echo '========== MONITORING STAGE =========='

                sh '''
                    set -e

                    echo "Checking production health endpoint..."

                    curl -fsS \
                        http://localhost:${PROD_PORT}/health

                    echo
                    echo "Checking Prometheus metrics endpoint..."

                    curl -fsS \
                        http://localhost:${PROD_PORT}/metrics \
                        | grep -E \
                        "http_requests_total|nodejs_eventloop_lag_p99_seconds" \
                        | head -20

                    echo
                    echo "Checking Prometheus target health..."

                    TARGETS=$(curl -fsS \
                        http://localhost:9090/api/v1/targets)

                    echo "$TARGETS" | grep -q '"health":"up"'

                    echo "Prometheus target is UP."

                    echo
                    echo "Monitoring verification completed successfully."
                '''
            }
        }
    }


    // =========================================================
    // PIPELINE POST ACTIONS
    // =========================================================
    post {

        success {
            echo '======================================================'
            echo 'TaskFlow DevOps Pipeline completed successfully.'
            echo "Build: ${BUILD_NUMBER}"
            echo "Release: 1.0.${BUILD_NUMBER}"
            echo 'All seven DevOps stages completed successfully.'
            echo '======================================================'
        }

        failure {
            echo '======================================================'
            echo 'TaskFlow DevOps Pipeline FAILED.'
            echo 'Review the failed stage and console output.'
            echo '======================================================'
        }

        always {
            archiveArtifacts(
                artifacts: '*.json',
                allowEmptyArchive: true,
                fingerprint: true
            )

            cleanWs(
                deleteDirs: true,
                disableDeferredWipeout: true
            )
        }
    }
}
