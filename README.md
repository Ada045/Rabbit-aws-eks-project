# Rabbit LMS — AWS EKS Cloud Deployment & CI/CD Automation

## Project Overview

I designed and deployed the **Rabbit LMS application** on Amazon Web Services (AWS) using Docker, Kubernetes, Amazon EKS, Amazon ECR, MongoDB, Helm, NGINX, and GitHub Actions.

The goal of the project was to build a reliable and automated deployment architecture where application updates could be released through a CI/CD pipeline instead of manually rebuilding and redeploying the application.

The final architecture supports **containerized frontend and backend services, persistent MongoDB storage, workload distribution across two EKS worker nodes, external application access, and automated rolling deployments.**

---
<img width="720" height="680" alt="cicd_pipeline_flow" src="https://github.com/user-attachments/assets/d3d368d0-1fca-44ec-9514-6d641ac7f316" />
<img width="720" height="680" alt="eks_cluster_internals" src="https://github.com/user-attachments/assets/4b04947c-1a66-47f7-9b24-d34573f8bc75" />




## Architecture

```text
                                                     Developer
                                                        │
                                                        │ git push
                                                        ▼
                                                 GitHub Repository
                                                        │
                                                        ▼
                                                GitHub Actions
                                                        │
                                          ┌─────────────┴─────────────┐
                                          │                           │
                                        Build Frontend              Build Backend
                                          │                           │
                                          └─────────────┬─────────────┘
                                                        │
                                                   Docker Images
                                                        │
                                                        ▼
                                                   Amazon ECR
                                                 ┌──────┴──────┐
                                                 │             │
                                          Frontend Image   Backend Image
                                                 │             │
                                                 └──────┬──────┘
                                                        │
                                                        ▼
                                                   Amazon EKS
                                                ┌───────────────┐
                                                │               │
                                           Worker Node 1   Worker Node 2
                                                │               │
                                          Frontend Pod     Frontend Pod
                                          Backend Pod      Backend Pod
                                                │               │
                                                └───────┬───────┘
                                                        │
                                                   Kubernetes
                                                     Services
                                                        │
                                                        ▼
                                                      NGINX
                                                        │
                                                        ▼
                                                AWS Load Balancer
                                                        │
                                                        ▼
                                                     Internet
                                        
                                                MongoDB Database
                                                        │
                                                 Persistent Volume
                                                        │
                                                   EBS CSI Driver
                                                        │
                                                        ▼
                                                     AWS EBS
```

---

# 1. AWS EKS Infrastructure

I started by creating an Amazon EKS cluster with a managed node group containing two worker nodes. I deployed my **frontend and backend in the `rabbit-app` namespace**, while MongoDB database ran separately in the **`rabbit-db` namespace**.

Instead of managing separate EC2 servers for each component, I used Kubernetes to manage my containers, pods, services, replicas, and workload distribution.

I configured pod anti-affinity so that the two frontend replicas and two backend replicas were distributed across the two nodes:

                                        Node 1              Node 2
                                        Frontend 1          Frontend 2
                                        Backend 1           Backend 2

This prevents all replicas of a workload from being placed on one node. If one node goes down, the replicas on the other node can continue serving the application.

<img width="1366" height="768" alt="Screenshot (49)" src="https://github.com/user-attachments/assets/8034850c-d18b-41b5-8552-ad0582aeb99a" />

---

# 2. Persistent MongoDB Storage

Before deploying **MongoDB**, I wanted to make sure that my database data would not depend on the lifecycle of the MongoDB pod.

If the MongoDB pod or the node running it failed, I didn't want the database data to disappear along with it. So, before installing MongoDB with Helm, I installed the **AWS EBS CSI Driver** as an add-on on my **EKS cluster**.

The EBS CSI Driver allows Kubernetes to provision and manage AWS EBS volumes as persistent storage for my workloads.

I then deployed MongoDB using Helm, with its storage configured through a **PersistentVolumeClaim (PVC)**.

---

# 3. MongoDB Deployment with Helm

I deployed **MongoDB using Helm** instead of manually creating each Kubernetes resource.

I used **`rabbit/mongo-k8s/values.yaml`** to **override specific default configurations** from the Helm chart and add the settings I needed for my application, including **persistent storage and database authentication with a password**.

MongoDB was exposed through a **Kubernetes Service**, giving my backend a stable internal endpoint to connect to the database within the cluster.

---

# 4. Backend Deployment & Configuration

I deployed the Rabbit LMS backend as a Kubernetes **Deployment** and specified **two replicas** in the Deployment configuration so Kubernetes could run the backend across my two worker nodes.

I created a **Kubernetes Secret** to securely store the MongoDB authentication details, including the **MongoDB URI**, and configured the required **environment variables** needed for the backend application to run.

The backend was exposed using a **ClusterIP Service**, allowing it to communicate with MongoDB through its internal Kubernetes Service without exposing the backend directly to the internet.

---

# 5. Frontend Deployment

I also containerized the Rabbit LMS frontend and created a Kubernetes Deployment for it.

The frontend was configured with **two replicas**.

The replicas allowed the application to run across the two worker nodes instead of depending on a single pod.

The frontend was also initially kept internal using Kubernetes service networking, with NGINX acting as the application entry point.

---

# 6. Pod Affinity / Anti-Affinity and Workload Distribution

I configured **pod anti-affinity rules** to distribute my frontend and backend replicas across the two worker nodes.

With two replicas for each application, I configured Kubernetes to avoid placing both replicas of the same component on the same node.

```text
                                        Worker Node 1          Worker Node 2
                                        ─────────────          ─────────────
                                        Frontend Pod 1         Frontend Pod 2
                                        Backend Pod 1          Backend Pod 2
```

This means that if one worker node goes down, the other node still has a frontend and backend pod running, allowing the application to remain accessible.

The goal was to improve **application availability and resilience** by avoiding a single point of failure at the node level.

---

# 7. NGINX and External Application Access

To make the application accessible from the internet, I deployed NGINX as the entry point for traffic into the cluster.

I configured the NGINX Kubernetes Service as a LoadBalancer, which allowed AWS to provision an external load balancer and provide a public endpoint for the application.

The traffic flow was:

```text
                                      Internet
                                          │
                                          ▼
                                      AWS Load Balancer
                                          │
                                          ▼
                                        NGINX
                                          │
                                          ├── Frontend
                                          │
                                          └── Backend
```

The frontend and backend remained running inside the Kubernetes cluster, while NGINX handled routing incoming requests to the appropriate application service. This gave me a single external endpoint through which users could access the Rabbit LMS application.

<img width="1366" height="222" alt="Screenshot (54)" src="https://github.com/user-attachments/assets/f210585a-1ed5-4a04-80a4-c09ca92e1151" />
<img width="1366" height="729" alt="Screenshot (56)" src="https://github.com/user-attachments/assets/9a1e37fc-e139-4da0-b7d3-d0e1d62d74f4" />

---

# 8. Automated CI/CD with GitHub Actions

After manually deploying and validating the application on EKS, I automated the deployment process using **GitHub Actions**.

Whenever I make an update or fix to the application and push the changes to the `main` branch, the pipeline is triggered automatically.

For AWS authentication, I stored my **AWS Access Key ID and AWS Secret Access Key** as encrypted **GitHub Secrets**. The workflow uses these credentials to authenticate with my AWS account and access the required AWS services.

The pipeline then:

1. **Increments the application version** using the credentials stored securely in GitHub Secrets.
2. **Authenticates with AWS** for the new release.
3. **Builds new Docker images** for both the frontend and backend.
4. **Pushes the versioned images to Amazon ECR**.
5. **Updates the Kubernetes Deployments** with the new image versions using `kubectl set image`.
6. **Triggers a Kubernetes RollingUpdate**, where the old pods are gradually replaced with pods running the new images.
7. **Verifies the rollout** to confirm that the new version is running successfully.


The Kubernetes Deployments are then updated to use the new images. Kubernetes handles the transition by gradually replacing the old pods with the new ones according to the configured **RollingUpdate strategy** rather than requiring me to manually delete and recreate the pods.

### Issue Encountered:

<img width="658" height="258" alt="Screenshot (58)" src="https://github.com/user-attachments/assets/e9334cb6-5d9d-4dcd-9492-ce0f50a7f4f7" />

During one of my deployments, I encountered a scheduling issue caused by the **pod anti-affinity rules** I had configured.

My anti-affinity rule was designed to prevent two replicas of the same application from running on the same worker node. This worked as expected during the initial deployment:

However, when GitHub Actions deployed a new application version, Kubernetes needed to create the new pods before removing the old ones.

Because both nodes already had a frontend pod and a backend pod, the anti-affinity rules prevented the new replicas from being scheduled on either node. As a result, the new pods remained in a **Pending** state because there was no node that satisfied the scheduling rules.

I resolved this by configuring the Deployment with a **RollingUpdate strategy**:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 0
    maxUnavailable: 1
```

With `maxSurge: 0`, Kubernetes does not create an additional pod beyond the desired replica count. With `maxUnavailable: 1`, Kubernetes is allowed to terminate one existing pod during the update.

The same process is then repeated for the remaining replicas.

This solved the scheduling conflict between my **pod anti-affinity rules** and the deployment process, while still maintaining the workload distribution I wanted across my two worker nodes.

---

### Application Connectivity

I configured communication between:

```text
Frontend → Backend → MongoDB
```

while keeping the appropriate services internal to the Kubernetes cluster.

### CI/CD Deployment

I automated the entire release process so that application changes could move from source code to production deployment without manually rebuilding and updating Kubernetes workloads.

---

# 9. Final Technology Stack

### Cloud

* AWS
* Amazon EKS
* Amazon ECR
* Amazon EBS
* AWS IAM
* AWS Load Balancer

### Containers & Orchestration

* Docker
* Kubernetes
* Helm
* NGINX

### CI/CD

* GitHub Actions
* Git

### Application

* React
* Node.js
* MongoDB

---

# Project Outcome

The final result is an automated cloud deployment architecture for Rabbit LMS.

A typical release now follows this process:

```text
                                        Developer pushes code
                                                ↓
                                        GitHub Actions starts
                                                ↓
                                        Application version increments
                                                ↓
                                        Frontend & backend are built
                                                ↓
                                        Docker images are created
                                                ↓
                                        Images are pushed to Amazon ECR
                                                ↓
                                        EKS deployments are updated
                                                ↓
                                        Kubernetes performs a RollingUpdate
                                                ↓
                                        New pods become Ready
                                                ↓
                                        Old pods are replaced
                                                ↓
                                        Deployment is verified
```

This project gave me practical experience designing and troubleshooting a complete **cloud-native deployment workflow**, from persistent database storage and Kubernetes workload scheduling to container registries, CI/CD automation, networking, IAM, and rolling application releases.

More importantly, it helped me understand how the individual components of a DevOps environment work together:

**Code → Docker → ECR → GitHub Actions → EKS → Kubernetes → Persistent Storage → Networking → Application**
