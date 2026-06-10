/**
 * PIPELINE CI/CD — HU-01: Filtrado de historial de revisiones
 * Proyecto: Outline — Wiki colaborativo
 *
 * Etapas:
 *  1. Checkout       — clona el repositorio
 *  2. Install         — instala dependencias con Yarn
 *  3. DB Migrate      — ejecuta migraciones en la BD de prueba
 *  4. Unit Tests      — corre pruebas unitarias (HU-01)
 *  5. Coverage        — genera reporte LCOV
 *  6. SonarQube       — análisis estático + cobertura
 *  7. Quality Gate    — verifica que Sonar apruebe el Quality Gate
 *  8. Docker Build    — construye la imagen de la aplicación
 *  9. Deploy          — despliega el contenedor en el entorno de staging
 */

pipeline {
    agent any

    environment {
        NODE_ENV       = 'test'
        DATABASE_URL   = 'postgres://outlineuser:pass@host.docker.internal:5433/outlinetest'
        REDIS_URL      = 'redis://host.docker.internal:6379'
        SECRET_KEY     = 'F0E5AD933D7F6FD8F4DBB3E038C501C052DC0593C686D21ACB30AE205D2F634B'
        SONAR_TOKEN    = credentials('sonarcloud-token')
        DOCKER_IMAGE   = 'outline-hu01'
        DOCKER_TAG     = "${env.BUILD_NUMBER}"
    }

    // Sin 'tools { nodejs }': el tool 'NodeJS-20' tiene Node.js 26 instalado
    // (configuración incorrecta en Jenkins). Instalamos Node.js 20 desde
    // NodeSource en la etapa de dependencias para garantizar la versión correcta.

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                echo "Rama: ${env.BRANCH_NAME} — Build #${env.BUILD_NUMBER}"
            }
        }

        stage('Install dependencies') {
            steps {
                // Instalar Node.js 20 LTS desde NodeSource (soportado por package.json engines)
                sh '''
                    apt-get update -qq
                    apt-get install -y libatomic1 curl ca-certificates
                    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
                    apt-get install -y nodejs
                    echo "Node.js: $(node --version)  npm: $(npm --version)"
                '''
                sh 'npm install -g corepack --force'
                sh 'corepack enable'
                sh 'corepack prepare yarn@4.11.0 --activate'
                sh 'yarn install --frozen-lockfile'
            }
        }

        stage('DB Migrate') {
            steps {
                sh 'yarn db:reset'
            }
        }

        stage('Unit Tests') {
            steps {
                sh 'mkdir -p test-results && TZ=UTC npx vitest run --project server "revisions" --reporter=verbose --reporter=junit --outputFile.junit=test-results/junit.xml'
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'test-results/junit.xml'
                }
            }
        }

        stage('Coverage') {
            steps {
                sh 'TZ=UTC npx vitest run --project server --coverage "revisions"'
            }
            post {
                always {
                    // Archiva el reporte HTML de cobertura como artefacto del build
                    archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
                }
            }
        }

        stage('SonarQube Analysis') {
            steps {
                // Token y servidor ya están en sonar-project.properties; no requiere plugin Jenkins
                sh 'npx sonarqube-scanner'
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    // Verifica Quality Gate via API REST de SonarCloud (sin waitForQualityGate)
                    sh 'node scripts/check-quality-gate.js'
                }
            }
        }

        stage('Docker Build') {
            steps {
                sh "docker build -t ${DOCKER_IMAGE}:${DOCKER_TAG} ."
                sh "docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${DOCKER_IMAGE}:latest"
            }
        }

        stage('Deploy Staging') {
            when {
                branch 'main'
            }
            steps {
                sh "docker stop ${DOCKER_IMAGE} || true"
                sh "docker rm   ${DOCKER_IMAGE} || true"
                sh """
                    docker run -d \
                      --name ${DOCKER_IMAGE} \
                      -p 3000:3000 \
                      -e NODE_ENV=production \
                      ${DOCKER_IMAGE}:${DOCKER_TAG}
                """
                echo "Desplegado en http://localhost:3000"
            }
        }
    }

    post {
        success {
            echo "Pipeline completado exitosamente — Quality Gate: PASSED"
        }
        failure {
            echo "Pipeline fallido — revisar logs de la etapa que falló"
        }
        always {
            cleanWs()
        }
    }
}
