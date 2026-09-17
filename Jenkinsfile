pipeline {
    agent any

    environment {
        IMAGE_NAME     = 'taskflow-api'
        STAGING_PORT   = '3000'
        PROD_PORT      = '4000'
        SNYK_TOKEN     = credentials('snyk-api-token')     // configure in Jenkins credentials
        SONAR_TOKEN    = credentials('sonar-api-token')    // configure in Jenkins credentials
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {

        // ---------- 1. BUILD ----------
        stage('Build') {
            steps {
                sh 'npm ci'
                sh 'npm run build'
                sh 'docker build -t $IMAGE_NAME:$BUILD_NUMBER -t $IMAGE_NAME:latest .'
            }
            post {
                success {
                    echo "Build artefact created: Docker image ${IMAGE_NAME}:${BUILD_NUMBER}"
                }
            }
        }

        // ---------- 2. TEST ----------
        stage('Test') {
            steps {
                sh 'npm test'
            }
            post {
                always {
                    junit 'reports/junit.xml'
                    archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
                }
            }
        }

        // ---------- 3. CODE QUALITY ----------
        stage('Code Quality') {
            steps {
                sh 'npm run lint'
                withSonarQubeEnv('SonarQube') {
                    sh 'npx sonar-scanner -Dsonar.login=$SONAR_TOKEN'
                }
            }
        }

        // ---------- 4. SECURITY ----------
        stage('Security') {
            steps {
                // Dependency vulnerability scan (Node.js built-in)
                sh 'npm audit --json > npm-audit-report.json || true'

                // Deeper SCA scan with Snyk (or swap for Trivy image scan)
                sh 'npx snyk test --json > snyk-report.json || true'
                sh 'npx snyk container test $IMAGE_NAME:latest --json > snyk-container-report.json || true'
            }
            post {
                always {
                    archiveArtifacts artifacts: '*-report.json', allowEmptyArchive: true
                }
            }
        }

        // ---------- 5. DEPLOY (to staging) ----------
        stage('Deploy') {
            steps {
                sh 'ENV=staging PORT=$STAGING_PORT TAG=$BUILD_NUMBER docker compose up -d --build'
                sh 'sleep 5'
                sh 'curl -f http://localhost:$STAGING_PORT/health'
            }
        }

        // ---------- 6. RELEASE (promote to production) ----------
        stage('Release') {
            when {
                branch 'main'
            }
            steps {
                sh 'docker tag $IMAGE_NAME:$BUILD_NUMBER $IMAGE_NAME:prod-$BUILD_NUMBER'
                sh "git tag v1.0.${BUILD_NUMBER}"
                sh 'ENV=production PORT=$PROD_PORT TAG=prod-$BUILD_NUMBER docker compose up -d --build'
                sh 'sleep 5'
                sh 'curl -f http://localhost:$PROD_PORT/health'
            }
        }

        // ---------- 7. MONITORING & ALERTING ----------
        stage('Monitoring') {
            steps {
                // Verify the /metrics endpoint is live and scrape-able
                sh 'curl -f http://localhost:$PROD_PORT/metrics'
                // Simulated alert hook -- replace with a real Datadog/New Relic webhook call
                sh '''
                  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PROD_PORT/health)
                  if [ "$STATUS" != "200" ]; then
                    echo "ALERT: production health check failed with status $STATUS"
                    exit 1
                  else
                    echo "Production is healthy (status $STATUS). Metrics available at /metrics."
                  fi
                '''
            }
        }
    }

    post {
        failure {
            echo 'Pipeline failed - see stage logs above for details.'
        }
        always {
            cleanWs()
        }
    }
}
