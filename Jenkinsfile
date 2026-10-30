pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Build Image') {
            steps {
                sh 'docker build -t event-website:latest .'
            }
        }

        stage('Import to k3s') {
            steps {
                sh 'docker save event-website:latest | sudo /usr/local/bin/k3s ctr images import -'
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    export KUBECONFIG=/var/lib/jenkins/.kube/config
                    sudo /usr/local/bin/k3s kubectl apply -f k8s/
                    sudo /usr/local/bin/k3s kubectl rollout restart deployment/web
                    sudo /usr/local/bin/k3s kubectl rollout status deployment/web --timeout=120s
                '''
            }
        }
    }

    post {
        success { echo 'Pipeline finished: website deployed.' }
        failure { echo 'Pipeline failed. Check the stage logs.' }
    }
}
