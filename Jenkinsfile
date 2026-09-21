pipeline {
    agent any

    environment {
        // -----------------------------
        // Application / Docker settings
        // -----------------------------
        IMAGE_REPOSITORY = 'localhost:5001/taskflow-api'
        IMAGE_NAME       = 'taskflow-api'

        STAGING_PORT     = '3000'
        PROD_PORT        = '4000'

        STAGING_PROJECT  = 'taskflow-staging'
        PROD_PROJECT     = 'taskflow-production'

        SONAR_PROJECT_KEY = 'Anshuman3311_TaskFlow-DevOps-Pipeline'
        SONAR_ORGANIZATION = 'anshuman3311'
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        skipDefaultCheckout(false)
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        // ============================================================
        // 1. BUILD
        // ============================================================
        stage('Build') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "STAGE 1: BUILD"
                    echo "========================================"

                    export PATH="/opt/homebrew/bin:/Users/anshumanjadav/.docker/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

                    echo "Node version:"
                    node --version

                    echo "NPM version:"
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

                    echo "Verifying image exists..."
                    docker image inspect ${IMAGE_REPOSITORY}:${BUILD_NUMBER} >/dev/null

                    echo "Build artifact created successfully:"
                    echo "${IMAGE_REPOSITORY}:${BUILD_NUMBER}"
                '''
            }

            post {
                success {
                    echo "Build stage completed successfully."
                }
            }
        }


        // ============================================================
        // 2. TEST
        // ============================================================
        stage('Test') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "STAGE 2: TEST"
                    echo "========================================"

                    npm test
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

                success {
                    echo "All automated tests passed."
                }
            }
        }


        // ============================================================
        // 3. CODE QUALITY
        // ============================================================
        stage('Code Quality') {
            steps {

                echo "========================================"
                echo "STAGE 3: CODE QUALITY"
                echo "========================================"

                sh '''
                    set -e

                    echo "Running ESLint..."
                    npm run lint

                    echo "ESLint completed successfully."
                '''

                /*
                 * IMPORTANT:
                 * Do NOT add SONAR_SCANNER_JAVA_OPTS here.
                 *
                 * The previous Build 21 failure was caused by:
                 *
                 * --enable-final-field-mutation=ALL-UNNAMED
                 *
                 * The Sonar scanner's provisioned Java runtime rejected
                 * that option.
                 *
                 * This is the known-working Sonar configuration.
                 */
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        set -e

                        echo "Running SonarCloud analysis..."

                        sonar-scanner \
                            -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                            -Dsonar.organization=${SONAR_ORGANIZATION} \
                            -Dsonar.qualitygate.wait=true \
                            -Dsonar.qualitygate.timeout=300

                        echo "SonarCloud Quality Gate passed."
                    '''
                }
            }

            post {
                success {
                    echo "Code Quality stage completed successfully."
                }
            }
        }


        // ============================================================
        // 4. SECURITY
        // ============================================================
        stage('Security') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "STAGE 4: SECURITY"
                    echo "========================================"

                    echo "Running npm dependency security audit..."

                    npm audit \
                        --audit-level=high \
                        --json > npm-audit-report.json

                    echo "npm audit passed."

                    echo "Running Trivy filesystem scan..."

                    trivy fs \
                        --scanners vuln \
                        --severity HIGH,CRITICAL \
                        --exit-code 1 \
                        --no-progress \
                        .

                    echo "Filesystem security scan passed."

                    echo "Running Trivy Docker image scan..."

                    trivy image \
                        --severity HIGH,CRITICAL \
                        --exit-code 1 \
                        --no-progress \
                        ${IMAGE_REPOSITORY}:${BUILD_NUMBER}

                    echo "Docker image security scan passed."

                    echo "All security checks passed."
                '''
            }

            post {
                always {
                    archiveArtifacts(
                        artifacts: 'npm-audit-report.json',
                        allowEmptyArchive: true,
                        fingerprint: true
                    )
                }

                success {
                    echo "Security stage completed successfully."
                }
            }
        }


        // ============================================================
        // 5. DEPLOY
        // Deploy exact tested image to staging
        // ============================================================
        stage('Deploy') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "STAGE 5: DEPLOY"
                    echo "========================================"

                    echo "Pulling exact build artifact from registry..."

                    docker pull ${IMAGE_REPOSITORY}:${BUILD_NUMBER}

                    echo "Deploying build ${BUILD_NUMBER} to staging..."

                    ENV=staging \
                    PORT=${STAGING_PORT} \
                    TAG=${BUILD_NUMBER} \
                    IMAGE_NAME=${IMAGE_REPOSITORY} \
                    APP_VERSION=${BUILD_NUMBER} \
                    JWT_SECRET="$STAGING_JWT_SECRET" \
                    docker compose -p ${STAGING_PROJECT} up -d taskflow-api

                    echo "Waiting for staging application to become healthy..."

                    HEALTHY=false

                    for i in $(seq 1 12); do
                        if curl -fsS http://localhost:${STAGING_PORT}/health >/dev/null; then
                            HEALTHY=true
                            echo "Staging application is healthy."
                            break
                        fi

                        echo "Health check attempt ${i}/12 failed. Waiting 5 seconds..."
                        sleep 5
                    done

                    if [ "$HEALTHY" != "true" ]; then
                        echo "Staging deployment failed."

                        echo "Attempting rollback to previous build..."

                        PREVIOUS_BUILD=$((BUILD_NUMBER - 1))

                        if [ "$PREVIOUS_BUILD" -ge 1 ]; then
                            docker pull ${IMAGE_REPOSITORY}:${PREVIOUS_BUILD} || true

                            if docker image inspect ${IMAGE_REPOSITORY}:${PREVIOUS_BUILD} >/dev/null 2>&1; then
                                ENV=staging \
                                PORT=${STAGING_PORT} \
                                TAG=${PREVIOUS_BUILD} \
                                IMAGE_NAME=${IMAGE_REPOSITORY} \
                                APP_VERSION=${PREVIOUS_BUILD} \
                                JWT_SECRET="$STAGING_JWT_SECRET" \
                                docker compose -p ${STAGING_PROJECT} up -d taskflow-api

                                sleep 5
                            fi
                        fi

                        exit 1
                    fi

                    echo "Verifying staging API response..."

                    curl -fsS http://localhost:${STAGING_PORT}/health

                    echo
                    echo "Staging deployment completed successfully."
                '''
            }

            environment {
                STAGING_JWT_SECRET = credentials('taskflow-staging-jwt')
            }

            post {
                success {
                    echo "Deploy stage completed successfully."
                }
            }
        }


        // ============================================================
        // 6. RELEASE
        // Promote exact staging-tested image to production
        // and create GitHub version tag
        // ============================================================
        stage('Release') {
            when {
                branch 'main'
            }

            steps {

                script {
                    withCredentials([
                        usernamePassword(
                            credentialsId: 'github-push-credentials',
                            usernameVariable: 'GITHUB_USER',
                            passwordVariable: 'GITHUB_TOKEN'
                        )
                    ]) {

                        sh '''
                            set -e

                            echo "========================================"
                            echo "STAGE 6: RELEASE"
                            echo "========================================"

                            RELEASE_TAG="v1.0.${BUILD_NUMBER}"

                            echo "Release version: ${RELEASE_TAG}"

                            echo "Verifying tested staging image..."

                            docker image inspect \
                                ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                                >/dev/null

                            echo "Creating production image tag..."

                            docker tag \
                                ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                                ${IMAGE_REPOSITORY}:prod-${BUILD_NUMBER}

                            echo "Pushing production image tag..."

                            docker push \
                                ${IMAGE_REPOSITORY}:prod-${BUILD_NUMBER}

                            echo "Deploying exact tested image to production..."

                            docker rm -f taskflow-api-production >/dev/null 2>&1 || true

                            ENV=production \
                            PORT=${PROD_PORT} \
                            TAG=prod-${BUILD_NUMBER} \
                            IMAGE_NAME=${IMAGE_REPOSITORY} \
                            APP_VERSION=${BUILD_NUMBER} \
                            JWT_SECRET="$PRODUCTION_JWT_SECRET" \
                            docker compose -p ${PROD_PROJECT} up -d taskflow-api

                            echo "Waiting for production application..."

                            HEALTHY=false

                            for i in $(seq 1 12); do
                                if curl -fsS http://localhost:${PROD_PORT}/health >/dev/null; then
                                    HEALTHY=true
                                    echo "Production application is healthy."
                                    break
                                fi

                                echo "Production health check ${i}/12 failed. Waiting 5 seconds..."
                                sleep 5
                            done

                            if [ "$HEALTHY" != "true" ]; then
                                echo "Production deployment failed."

                                echo "Attempting rollback..."

                                PREVIOUS_BUILD=$((BUILD_NUMBER - 1))

                                if [ "$PREVIOUS_BUILD" -ge 1 ]; then
                                    docker pull \
                                        ${IMAGE_REPOSITORY}:prod-${PREVIOUS_BUILD} \
                                        || true

                                    if docker image inspect \
                                        ${IMAGE_REPOSITORY}:prod-${PREVIOUS_BUILD} \
                                        >/dev/null 2>&1; then

                                        docker rm -f taskflow-api-production \
                                            >/dev/null 2>&1 || true

                                        ENV=production \
                                        PORT=${PROD_PORT} \
                                        TAG=prod-${PREVIOUS_BUILD} \
                                        IMAGE_NAME=${IMAGE_REPOSITORY} \
                                        APP_VERSION=${PREVIOUS_BUILD} \
                                        JWT_SECRET="$PRODUCTION_JWT_SECRET" \
                                        docker compose -p ${PROD_PROJECT} up -d taskflow-api

                                        sleep 5
                                    fi
                                fi

                                exit 1
                            fi

                            echo "Production health check passed."

                            echo "Creating GitHub release tag ${RELEASE_TAG}..."

                            COMMIT_SHA=$(git rev-parse HEAD)

                            echo "Commit SHA: ${COMMIT_SHA}"

                            node <<'NODE'
const fs = require('fs');

const payload = {
    ref: `refs/tags/v1.0.${process.env.BUILD_NUMBER}`,
    sha: process.env.COMMIT_SHA
};

fs.writeFileSync(
    'github-tag-payload.json',
    JSON.stringify(payload)
);
NODE

                            curl \
                                --fail-with-body \
                                --silent \
                                --show-error \
                                --request POST \
                                --url "https://api.github.com/repos/Anshuman3311/TaskFlow-DevOps-Pipeline/git/refs" \
                                --header "Accept: application/vnd.github+json" \
                                --header "Authorization: Bearer ${GITHUB_TOKEN}" \
                                --header "X-GitHub-Api-Version: 2022-11-28" \
                                --header "Content-Type: application/json" \
                                --data-binary @github-tag-payload.json

                            echo

                            echo "Verifying GitHub tag..."

                            curl \
                                --fail \
                                --silent \
                                --show-error \
                                --request GET \
                                --url "https://api.github.com/repos/Anshuman3311/TaskFlow-DevOps-Pipeline/git/ref/tags/${RELEASE_TAG}" \
                                --header "Accept: application/vnd.github+json" \
                                --header "Authorization: Bearer ${GITHUB_TOKEN}" \
                                --header "X-GitHub-Api-Version: 2022-11-28" \
                                >/dev/null

                            echo "GitHub tag ${RELEASE_TAG} created successfully."

                            rm -f github-tag-payload.json

                            echo "Release completed successfully."
                        '''

                        sh '''
                            echo "GitHub release tag verified."
                        '''
                    }
                }
            }

            environment {
                PRODUCTION_JWT_SECRET = credentials('taskflow-production-jwt')
            }

            post {
                success {
                    echo "Release stage completed successfully."
                }
            }
        }


        // ============================================================
        // 7. MONITORING & ALERTING
        // ============================================================
        stage('Monitoring') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "STAGE 7: MONITORING & ALERTING"
                    echo "========================================"

                    echo "Checking production health..."

                    curl -fsS \
                        http://localhost:${PROD_PORT}/health

                    echo
                    echo "Production health endpoint passed."

                    echo "Checking production metrics endpoint..."

                    curl -fsS \
                        http://localhost:${PROD_PORT}/metrics \
                        >/tmp/taskflow-metrics.txt

                    grep -q "http_requests_total" \
                        /tmp/taskflow-metrics.txt

                    echo "Metrics endpoint passed."

                    echo "Connecting Prometheus to production network..."

                    docker network connect \
                        ${PROD_PROJECT}_default \
                        taskflow-prometheus \
                        2>/dev/null || true

                    echo "Waiting for Prometheus to scrape production..."

                    sleep 20

                    echo "Checking Prometheus target health..."

                    TARGETS=$(curl -fsS \
                        http://localhost:9090/api/v1/targets)

                    echo "$TARGETS" | grep -q '"job":"taskflow-api"'
                    echo "$TARGETS" | grep -q '"health":"up"'

                    echo "Prometheus target is UP."

                    echo "Monitoring verification completed successfully."
                '''
            }

            post {
                success {
                    echo "Monitoring and alerting stage completed successfully."
                }
            }
        }
    }


    // ================================================================
    // PIPELINE POST ACTIONS
    // ================================================================
    post {

        success {
            echo "=================================================="
            echo "TASKFLOW DEVOPS PIPELINE COMPLETED SUCCESSFULLY"
            echo "All 7 stages passed."
            echo "Build: ${BUILD_NUMBER}"
            echo "Release: v1.0.${BUILD_NUMBER}"
            echo "=================================================="
        }

        failure {
            echo "=================================================="
            echo "TASKFLOW DEVOPS PIPELINE FAILED"
            echo "Check the failed stage above."
            echo "=================================================="
        }

        always {
            archiveArtifacts(
                artifacts: 'npm-audit-report.json,github-tag-payload.json',
                allowEmptyArchive: true
            )

            cleanWs()
        }
    }
}
