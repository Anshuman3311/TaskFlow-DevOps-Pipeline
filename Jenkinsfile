pipeline {

    agent any

    environment {
        PATH = "/opt/homebrew/bin:/Users/anshumanjadav/.docker/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

        IMAGE_REPOSITORY = "localhost:5001/taskflow-api"

        STAGING_PORT = "3000"
        PROD_PORT = "4000"

        STAGING_PROJECT = "taskflow-staging"
        PROD_PROJECT = "taskflow-production"

        SONAR_PROJECT_KEY = "Anshuman3311_TaskFlow-DevOps-Pipeline"
        SONAR_ORGANIZATION = "anshuman3311"
    }

    options {
        disableConcurrentBuilds()

        buildDiscarder(
            logRotator(
                numToKeepStr: '10'
            )
        )

        skipDefaultCheckout(false)
    }

    stages {

        stage('Build') {
            steps {
                echo "GIT_BRANCH=${env.GIT_BRANCH} | BRANCH_NAME=${env.BRANCH_NAME}"

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
                        -t ${IMAGE_REPOSITORY}:1.0.${BUILD_NUMBER} \
                        .

                    echo "Pushing build artifact to local registry..."
                    docker push ${IMAGE_REPOSITORY}:${BUILD_NUMBER}
                    docker push ${IMAGE_REPOSITORY}:1.0.${BUILD_NUMBER}

                    echo "Build artifact created successfully."
                '''
            }
        }

        stage('Test') {
            steps {
                sh '''
                    set -e

                    echo "Running automated test suite..."

                    npm test

                    echo "Test execution completed successfully."
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
                        allowEmptyArchive: true
                    )
                }
            }
        }

        stage('Code Quality') {
            steps {
                sh '''
                    set -e

                    echo "Running ESLint..."
                    npm run lint

                    echo "ESLint passed."
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

        stage('Security') {
            steps {
                sh '''
                    set -e

                    echo "Running npm dependency security audit..."

                    npm audit --audit-level=high --json > npm-audit-report.json

                    echo "npm audit passed."

                    echo "Running Trivy vulnerability scan..."

                    trivy image \
                        --severity HIGH,CRITICAL \
                        --exit-code 1 \
                        ${IMAGE_REPOSITORY}:${BUILD_NUMBER}

                    echo "Trivy security scan passed."

                    echo "Security verification completed successfully."
                '''

                archiveArtifacts(
                    artifacts: 'npm-audit-report.json',
                    allowEmptyArchive: true
                )
            }
        }

        stage('Deploy') {
            steps {
                script {
                    withCredentials([
                        string(
                            credentialsId: 'taskflow-staging-jwt',
                            variable: 'STAGING_JWT_SECRET'
                        )
                    ]) {
                        sh '''
                            set -e

                            echo "Deploying exact build artifact to staging..."

                            docker image inspect \
                                ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                                >/dev/null

                            ENV=staging \
                            PORT=${STAGING_PORT} \
                            TAG=${BUILD_NUMBER} \
                            IMAGE_NAME=${IMAGE_REPOSITORY} \
                            APP_VERSION=${BUILD_NUMBER} \
                            JWT_SECRET="$STAGING_JWT_SECRET" \
                            docker compose \
                                -p ${STAGING_PROJECT} \
                                up -d taskflow-api

                            HEALTHY=false

                            for i in $(seq 1 12); do
                                if curl -fsS \
                                    http://localhost:${STAGING_PORT}/health \
                                    >/dev/null; then

                                    HEALTHY=true
                                    echo "Staging application is healthy."
                                    break
                                fi

                                sleep 5
                            done

                            if [ "$HEALTHY" != "true" ]; then
                                echo "Staging deployment failed."

                                PREVIOUS_BUILD=$((BUILD_NUMBER - 1))

                                if [ "$PREVIOUS_BUILD" -gt 0 ]; then

                                    docker pull \
                                        ${IMAGE_REPOSITORY}:${PREVIOUS_BUILD} \
                                        || true

                                    if docker image inspect \
                                        ${IMAGE_REPOSITORY}:${PREVIOUS_BUILD} \
                                        >/dev/null 2>&1; then

                                        echo "Rolling back staging to build ${PREVIOUS_BUILD}..."

                                        ENV=staging \
                                        PORT=${STAGING_PORT} \
                                        TAG=${PREVIOUS_BUILD} \
                                        IMAGE_NAME=${IMAGE_REPOSITORY} \
                                        APP_VERSION=${PREVIOUS_BUILD} \
                                        JWT_SECRET="$STAGING_JWT_SECRET" \
                                        docker compose \
                                            -p ${STAGING_PROJECT} \
                                            up -d taskflow-api
                                    fi
                                fi

                                exit 1
                            fi

                            echo "Staging deployment completed successfully."
                        '''
                    }
                }
            }
        }

        stage('Release') {

            when {
                anyOf {
                    branch 'main'
                    expression { env.GIT_BRANCH == 'main' }
                    expression { env.GIT_BRANCH == 'origin/main' }
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

                            RELEASE_TAG="v1.0.${BUILD_NUMBER}"

                            docker image inspect ${IMAGE_REPOSITORY}:${BUILD_NUMBER} >/dev/null

                            docker tag \
                                ${IMAGE_REPOSITORY}:${BUILD_NUMBER} \
                                ${IMAGE_REPOSITORY}:prod-${BUILD_NUMBER}

                            docker push \
                                ${IMAGE_REPOSITORY}:prod-${BUILD_NUMBER}

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

                            HEALTHY=false

                            for i in $(seq 1 12); do
                                if curl -fsS \
                                    http://localhost:${PROD_PORT}/health \
                                    >/dev/null; then

                                    HEALTHY=true
                                    echo "Production application is healthy."
                                    break
                                fi

                                sleep 5
                            done

                            if [ "$HEALTHY" != "true" ]; then

                                echo "Production deployment failed."

                                PREVIOUS_BUILD=$((BUILD_NUMBER - 1))

                                if [ "$PREVIOUS_BUILD" -gt 0 ]; then

                                    docker pull \
                                        ${IMAGE_REPOSITORY}:prod-${PREVIOUS_BUILD} \
                                        || true

                                    if docker image inspect \
                                        ${IMAGE_REPOSITORY}:prod-${PREVIOUS_BUILD} \
                                        >/dev/null 2>&1; then

                                        echo "Rolling back production to build ${PREVIOUS_BUILD}..."

                                        ENV=production \
                                        PORT=${PROD_PORT} \
                                        TAG=prod-${PREVIOUS_BUILD} \
                                        IMAGE_NAME=${IMAGE_REPOSITORY} \
                                        APP_VERSION=${PREVIOUS_BUILD} \
                                        JWT_SECRET="$PRODUCTION_JWT_SECRET" \
                                        docker compose \
                                            -p ${PROD_PROJECT} \
                                            up -d taskflow-api
                                    fi
                                fi

                                exit 1
                            fi

                            echo "Production deployment completed successfully."

                            COMMIT_SHA=$(git rev-parse HEAD)
                            export COMMIT_SHA

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

                            rm -f github-tag-payload.json
                        '''
                    }
                }
            }
        }

        stage('Monitoring') {
            steps {
                sh '''
                    set -e

                    echo "Checking production health endpoint..."

                    curl \
                        --fail \
                        http://localhost:${PROD_PORT}/health \
                        >/dev/null

                    echo "Production health endpoint is healthy."

                    echo "Checking application metrics endpoint..."

                    curl \
                        --fail \
                        http://localhost:${PROD_PORT}/metrics \
                        >/dev/null

                    echo "Application metrics endpoint is available."

                    echo "Connecting Prometheus to production network..."

                    docker network connect \
                        ${PROD_PROJECT}_default \
                        taskflow-prometheus \
                        2>/dev/null || true

                    echo "Waiting for Prometheus to scrape the production API..."

                    sleep 20

                    TARGETS=$(curl -fsS \
                        http://localhost:9090/api/v1/targets)

                    echo "$TARGETS"

                    echo "$TARGETS" | grep -q '"health":"up"'

                    echo "Prometheus target is healthy."

                    echo "Monitoring verification completed successfully."
                '''
            }
        }
    }

    post {
        always {
            echo "Pipeline completed. Cleaning workspace..."

            archiveArtifacts(
                artifacts: 'npm-audit-report.json,reports/junit.xml',
                allowEmptyArchive: true
            )

            cleanWs()
        }
    }
}
