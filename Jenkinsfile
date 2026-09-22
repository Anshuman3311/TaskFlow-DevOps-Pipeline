pipeline {
    agent any

    environment {
        // Make Node, npm, Docker and Trivy available to every stage
        PATH = "/opt/homebrew/bin:/Users/anshumanjadav/.docker/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

        IMAGE_REPOSITORY = 'localhost:5001/taskflow-api'
        IMAGE_NAME       = 'taskflow-api'

        STAGING_PORT     = '3000'
        PROD_PORT        = '4000'

        STAGING_PROJECT  = 'taskflow-staging'
        PROD_PROJECT     = 'taskflow-production'

        SONAR_PROJECT_KEY  = 'Anshuman3311_TaskFlow-DevOps-Pipeline'
        SONAR_ORGANIZATION = 'anshuman3311'
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        skipDefaultCheckout(false)
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        stage('Build') {
            steps {
                // Debug line: confirms what Jenkins thinks the branch is,
                // via the Git plugin's env var (works in non-multibranch jobs).
                // The Release stage's "when" condition relies on this value.
                echo "GIT_BRANCH detected as: ${env.GIT_BRANCH}"

                sh '''
                    set -e

                    echo "========================================"
                    echo "STAGE 1: BUILD"
                    echo "========================================"

                    echo "Node version:"
                    node --version

                    echo "NPM version:"
                    npm --version

                    echo "Docker version:"
                    docker --version

                    echo "Trivy version:"
                    trivy --version

                    echo ""
                    echo "Installing dependencies..."
                    npm ci

                    echo ""
                    echo "Running application build..."
                    npm run build

                    echo ""
                    echo "Building Docker image..."

                    docker build \
                        -t ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                        -t ${IMAGE_REPOSITORY}:latest \
                        .

                    echo ""
                    echo "Pushing versioned build artifact..."

                    docker push \
                        ${IMAGE_REPOSITORY}:${BUILD_NUMBER}

                    echo ""
                    echo "Updating latest image..."

                    docker push \
                        ${IMAGE_REPOSITORY}:latest

                    echo ""
                    echo "Verifying build artifact..."

                    docker image inspect \
                        ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                        >/dev/null

                    echo ""
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


        stage('Test') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "STAGE 2: TEST"
                    echo "========================================"

                    echo "Node version:"
                    node --version

                    echo "NPM version:"
                    npm --version

                    echo ""
                    echo "Running automated Jest test suite..."

                    npm test

                    echo ""
                    echo "Automated test suite completed successfully."
                '''
            }

            post {
                always {
                    junit(
                        testResults: 'reports/junit.xml',
                        allowEmptyResults: true
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

                withSonarQubeEnv('SonarQube') {
                    sh '''
                        set -e

                        echo "Running SonarCloud analysis..."

                        sonar-scanner \
                            -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                            -Dsonar.organization=${SONAR_ORGANIZATION} \
                            -Dsonar.qualitygate.wait=true \
                            -Dsonar.qualitygate.timeout=300

                        echo ""
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


        stage('Security') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "STAGE 4: SECURITY"
                    echo "========================================"

                    echo ""
                    echo "Running npm dependency security audit..."

                    npm audit \
                        --audit-level=high \
                        --json > npm-audit-report.json

                    echo "npm audit passed."

                    echo ""
                    echo "Running Trivy filesystem scan..."

                    trivy fs \
                        --scanners vuln \
                        --severity HIGH,CRITICAL \
                        --exit-code 1 \
                        --no-progress \
                        .

                    echo "Trivy filesystem scan passed."

                    echo ""
                    echo "Running Trivy Docker image scan..."

                    trivy image \
                        --severity HIGH,CRITICAL \
                        --exit-code 1 \
                        --no-progress \
                        ${IMAGE_REPOSITORY}:${BUILD_NUMBER}

                    echo ""
                    echo "Trivy Docker image scan passed."

                    echo ""
                    echo "No HIGH or CRITICAL vulnerabilities detected."
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


        stage('Deploy') {

            environment {
                STAGING_JWT_SECRET = credentials('taskflow-staging-jwt')
            }

            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "STAGE 5: DEPLOY"
                    echo "========================================"

                    echo "Pulling exact build artifact from registry..."

                    docker pull \
                        ${IMAGE_REPOSITORY}:${BUILD_NUMBER}

                    echo "Deploying build ${BUILD_NUMBER} to staging..."

                    ENV=staging \
                    PORT=${STAGING_PORT} \
                    TAG=${BUILD_NUMBER} \
                    IMAGE_NAME=${IMAGE_REPOSITORY} \
                    APP_VERSION=${BUILD_NUMBER} \
                    JWT_SECRET="$STAGING_JWT_SECRET" \
                    docker compose \
                        -p ${STAGING_PROJECT} \
                        up -d taskflow-api

                    echo ""
                    echo "Waiting for staging application to become healthy..."

                    HEALTHY=false

                    for i in $(seq 1 12); do
                        if curl -fsS \
                            http://localhost:${STAGING_PORT}/health \
                            >/dev/null; then

                            HEALTHY=true

                            echo "Staging application is healthy."

                            break
                        fi

                        echo "Health check attempt ${i}/12 failed."
                        sleep 5
                    done

                    if [ "$HEALTHY" != "true" ]; then

                        echo "Staging deployment failed."
                        echo "Attempting rollback..."

                        PREVIOUS_BUILD=$((BUILD_NUMBER - 1))

                        if [ "$PREVIOUS_BUILD" -ge 1 ]; then

                            docker pull \
                                ${IMAGE_REPOSITORY}:${PREVIOUS_BUILD} \
                                || true

                            if docker image inspect \
                                ${IMAGE_REPOSITORY}:${PREVIOUS_BUILD} \
                                >/dev/null 2>&1; then

                                ENV=staging \
                                PORT=${STAGING_PORT} \
                                TAG=${PREVIOUS_BUILD} \
                                IMAGE_NAME=${IMAGE_REPOSITORY} \
                                APP_VERSION=${PREVIOUS_BUILD} \
                                JWT_SECRET="$STAGING_JWT_SECRET" \
                                docker compose \
                                    -p ${STAGING_PROJECT} \
                                    up -d taskflow-api

                                sleep 5
                            fi
                        fi

                        exit 1
                    fi

                    echo ""
                    echo "Verifying staging health endpoint..."

                    curl -fsS \
                        http://localhost:${STAGING_PORT}/health

                    echo ""
                    echo "Staging deployment completed successfully."
                '''
            }

            post {
                success {
                    echo "Deploy stage completed successfully."
                }
            }
        }


        stage('Release') {

            // FIXED: the previous "branch 'main'" condition throws
            // MissingContextVariableException outside a Multibranch Pipeline
            // job, which fails (not skips) this stage and cascades into
            // Monitoring. env.GIT_BRANCH is set by the Git plugin on every
            // Pipeline job (regular or multibranch) after "checkout scm",
            // so it's safe to rely on here.
            when {
                expression {
                    def branch = env.GIT_BRANCH ?: ''
                    return branch == 'main' || branch == 'origin/main' || branch.endsWith('/main')
                }
            }

            environment {
                PRODUCTION_JWT_SECRET = credentials('taskflow-production-jwt')
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

                            echo ""
                            echo "Release version: ${RELEASE_TAG}"

                            echo ""
                            echo "Verifying exact tested artifact..."

                            docker image inspect \
                                ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                                >/dev/null

                            echo "Build artifact verified."

                            echo ""
                            echo "Creating production image tag..."

                            docker tag \
                                ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                                ${IMAGE_REPOSITORY}:prod-${BUILD_NUMBER}

                            echo ""
                            echo "Pushing production image..."

                            docker push \
                                ${IMAGE_REPOSITORY}:prod-${BUILD_NUMBER}

                            echo ""
                            echo "Deploying exact tested image to production..."

                            docker rm -f \
                                taskflow-api-production \
                                >/dev/null 2>&1 || true

                            ENV=production \
                            PORT=${PROD_PORT} \
                            TAG=prod-${BUILD_NUMBER} \
                            IMAGE_NAME=${IMAGE_REPOSITORY} \
                            APP_VERSION=${BUILD_NUMBER} \
                            JWT_SECRET="$PRODUCTION_JWT_SECRET" \
                            docker compose \
                                -p ${PROD_PROJECT} \
                                up -d taskflow-api

                            echo ""
                            echo "Waiting for production application..."

                            HEALTHY=false

                            for i in $(seq 1 12); do

                                if curl -fsS \
                                    http://localhost:${PROD_PORT}/health \
                                    >/dev/null; then

                                    HEALTHY=true

                                    echo "Production application is healthy."

                                    break
                                fi

                                echo "Production health check ${i}/12 failed."
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

                                        docker rm -f \
                                            taskflow-api-production \
                                            >/dev/null 2>&1 || true

                                        ENV=production \
                                        PORT=${PROD_PORT} \
                                        TAG=prod-${PREVIOUS_BUILD} \
                                        IMAGE_NAME=${IMAGE_REPOSITORY} \
                                        APP_VERSION=${PREVIOUS_BUILD} \
                                        JWT_SECRET="$PRODUCTION_JWT_SECRET" \
                                        docker compose \
                                            -p ${PROD_PROJECT} \
                                            up -d taskflow-api

                                        sleep 5
                                    fi
                                fi

                                exit 1
                            fi

                            echo ""
                            echo "Production health check passed."

                            echo ""
                            echo "Preparing GitHub tag..."

                            COMMIT_SHA=$(git rev-parse HEAD)
                            export COMMIT_SHA

                            echo "Commit SHA: ${COMMIT_SHA}"

                            node <<'NODE'
const fs = require('fs');

const buildNumber = process.env.BUILD_NUMBER;
const commitSha = process.env.COMMIT_SHA;

if (!buildNumber) {
    throw new Error('BUILD_NUMBER is missing.');
}

if (!commitSha) {
    throw new Error('COMMIT_SHA is missing.');
}

const payload = {
    ref: `refs/tags/v1.0.${buildNumber}`,
    sha: commitSha
};

fs.writeFileSync(
    'github-tag-payload.json',
    JSON.stringify(payload)
);

console.log('GitHub tag payload generated successfully.');
NODE

                            echo ""
                            echo "Creating GitHub tag ${RELEASE_TAG}..."

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

                            echo ""
                            echo "GitHub tag creation completed."

                            echo ""
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

                            echo ""
                            echo "GitHub tag ${RELEASE_TAG} verified successfully."

                            rm -f github-tag-payload.json

                            echo ""
                            echo "Release completed successfully."
                        '''
                    }
                }
            }

            post {
                success {
                    echo "Release stage completed successfully."
                }
            }
        }


        stage('Monitoring') {

            steps {

                sh '''
                    set -e

                    echo "========================================"
                    echo "STAGE 7: MONITORING"
                    echo "========================================"

                    echo ""
                    echo "Checking production health..."

                    curl -fsS \
                        http://localhost:${PROD_PORT}/health

                    echo ""
                    echo "Production health check passed."

                    echo ""
                    echo "Checking production metrics..."

                    curl -fsS \
                        http://localhost:${PROD_PORT}/metrics \
                        >/tmp/taskflow-metrics.txt

                    grep -q \
                        "http_requests_total" \
                        /tmp/taskflow-metrics.txt

                    echo "Metrics endpoint passed."

                    echo ""
                    echo "Connecting Prometheus to production network..."

                    docker network connect \
                        ${PROD_PROJECT}_default \
                        taskflow-prometheus \
                        2>/dev/null || true

                    echo ""
                    echo "Waiting for Prometheus scrape..."

                    sleep 20

                    echo ""
                    echo "Checking Prometheus targets..."

                    TARGETS=$(curl -fsS \
                        http://localhost:9090/api/v1/targets)

                    echo "$TARGETS" | grep -q \
                        '"job":"taskflow-api"'

                    echo "$TARGETS" | grep -q \
                        '"health":"up"'

                    echo ""
                    echo "Prometheus target is UP."

                    echo ""
                    echo "Monitoring verification completed successfully."
                '''
            }

            post {
                success {
                    echo "Monitoring stage completed successfully."
                }
            }
        }
    }


    post {

        success {

            echo ""
            echo "=================================================="
            echo "TASKFLOW DEVOPS PIPELINE COMPLETED SUCCESSFULLY"
            echo "=================================================="
            echo "ALL 7 STAGES PASSED"
            echo "Build: ${BUILD_NUMBER}"
            echo "Release: v1.0.${BUILD_NUMBER}"
            echo "=================================================="
        }

        failure {

            echo ""
            echo "=================================================="
            echo "TASKFLOW DEVOPS PIPELINE FAILED"
            echo "=================================================="
            echo "Check the first failed stage above."
            echo "=================================================="
        }

        always {

            archiveArtifacts(
                artifacts: 'npm-audit-report.json,github-tag-payload.json',
                allowEmptyArchive: true,
                fingerprint: true
            )

            cleanWs()
        }
    }
}
