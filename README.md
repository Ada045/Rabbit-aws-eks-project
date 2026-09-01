# Rabbit LMS — AWS EKS Cloud Deployment & CI/CD Automation

## Project Overview

I designed and deployed the **Rabbit LMS application** on Amazon Web Services (AWS) using Docker, Kubernetes, Amazon EKS, Amazon ECR, MongoDB, Helm, NGINX, and GitHub Actions.

The goal of the project was to build a reliable and automated deployment architecture where application updates could be released through a CI/CD pipeline instead of manually rebuilding and redeploying the application.

The final architecture supports **containerized frontend and backend services, persistent MongoDB storage, workload distribution across two EKS worker nodes, external application access, and automated rolling deployments.**

---

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

# 5. Backend Deployment

### 3. Backend Deployment & Configuration

I deployed the Rabbit LMS backend as a Kubernetes **Deployment** and specified **two replicas** in the Deployment configuration so Kubernetes could run the backend across my two worker nodes.

I created a **Kubernetes Secret** to securely store the MongoDB authentication details, including the **MongoDB URI**, and configured the required **environment variables** needed for the backend application to run.

The backend was exposed using a **ClusterIP Service**, allowing it to communicate with MongoDB through its internal Kubernetes Service without exposing the backend directly to the internet.

---

# 6. Frontend Deployment

I also containerized the Rabbit LMS frontend and created a Kubernetes Deployment for it.

The frontend was configured with **two replicas**.

The replicas allowed the application to run across the two worker nodes instead of depending on a single pod.

The frontend was also initially kept internal using Kubernetes service networking, with NGINX acting as the application entry point.

---

# 7. Pod Affinity / Anti-Affinity and Workload Distribution

One of the important Kubernetes configurations I implemented was workload distribution using affinity/anti-affinity rules.

My objective was to avoid placing both replicas of the same application component on the same worker node.

For example:

```text
Worker Node 1             Worker Node 2
─────────────             ─────────────
Frontend Pod 1            Frontend Pod 2
Backend Pod 1             Backend Pod 2
```

Instead of:

```text
Worker Node 1             Worker Node 2
─────────────             ─────────────
Frontend Pod 1            Backend Pod 1
Frontend Pod 2
Backend Pod 2
```

### Why?

If both frontend replicas were placed on the same node and that node failed, both replicas could become unavailable.

Distributing the replicas across the nodes improves workload resilience.

---

## Scheduling Challenge

<img width="658" height="258" alt="Screenshot (58)" src="https://github.com/user-attachments/assets/e9334cb6-5d9d-4dcd-9492-ce0f50a7f4f7" />

This configuration also introduced one of the major problems I encountered during the project.

My initial affinity/anti-affinity rules were **too restrictive** for the capacity of my two-node cluster.

Kubernetes was unable to find a node that satisfied all the scheduling requirements.

As a result, some pods remained in:

```text
Pending
```

state.

I investigated the scheduler behavior and adjusted the affinity configuration so that the workload could be distributed across the available nodes without preventing Kubernetes from scheduling the pods.

### What I learned

Affinity rules are powerful, but they must be designed according to the actual capacity and topology of the cluster.

A scheduling rule that is too strict can become a scheduling blocker rather than improving availability.

---

# 8. NGINX and External Application Access

Once the application was running inside Kubernetes, I needed a way for external users to access it.

I deployed **NGINX** as the entry point for application traffic.

I configured the relevant Kubernetes Service as a **LoadBalancer**.

AWS then provisioned an external load balancer that provided a publicly accessible endpoint.

The traffic flow became:

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

### Why?

The frontend and backend workloads could remain internal to the Kubernetes cluster while NGINX handled incoming application traffic.

The AWS LoadBalancer integration provided external access without exposing every individual application pod directly to the internet.

---

# 9. GitHub Actions CI/CD Pipeline

After manually deploying and validating the application, I automated the deployment process using **GitHub Actions**.

The objective was to make application releases repeatable and automated.

The pipeline is triggered whenever a new version is pushed to the `main` branch.

### CI/CD Flow

```text
Git Push
   │
   ▼
GitHub Actions
   │
   ▼
Increment Application Version
   │
   ├───────────────┐
   ▼               ▼
Build Frontend   Build Backend
   │               │
   └───────┬───────┘
           ▼
      Docker Images
           │
           ▼
      Amazon ECR
           │
           ▼
       Amazon EKS
           │
           ▼
    Update Deployment
           │
           ▼
    Rolling Update
           │
           ▼
   Verify Deployment
```

---

# 10. Versioned Docker Images

Every pipeline execution increments the application version.

For example:

```text
rabbit-frontend:0.0.1
rabbit-backend:0.0.1
```

A subsequent deployment might produce:

```text
rabbit-frontend:0.0.2
rabbit-backend:0.0.2
```

The images are pushed to Amazon ECR.

This gives each deployment a specific image version rather than relying on an ambiguous tag such as `latest`.

### Why?

Versioned images make deployments easier to track and make it clear which application version is running inside the cluster.

---

# 11. Kubernetes Rolling Update

After pushing the new images to ECR, GitHub Actions updates the Kubernetes Deployments using `kubectl set image`.

Kubernetes then performs a **RollingUpdate**.

For example, before deployment:

```text
Node 1                    Node 2
────────                   ────────
Backend v1                Backend v1
Frontend v1               Frontend v1
```

When version `v2` is released, Kubernetes gradually replaces the old pods with new pods.

During the update:

```text
Node 1                    Node 2
────────                   ────────
Backend v2                Backend v1
Frontend v1               Frontend v2
```

After the rollout:

```text
Node 1                    Node 2
────────                   ────────
Backend v2                Backend v2
Frontend v2               Frontend v2
```

The important point is that I **do not manually delete the old pods**.

Kubernetes manages the transition from the old ReplicaSet to the new ReplicaSet according to the Deployment's rolling update strategy.

The pipeline waits for the rollout to complete before continuing.

---

# 12. Deployment Verification

The pipeline also performs a final verification stage.

It checks:

* Kubernetes Deployments
* Running pods
* Kubernetes Services
* Deployed container images
* Application version
* Cluster and namespace information

This provides confirmation that the new application version was successfully rolled out.

---

# 13. AWS Authentication

For the final implementation, GitHub Actions authenticates with AWS using **credentials stored securely as GitHub Secrets**.

This allows the pipeline to authenticate to AWS without placing the credentials directly inside the workflow file.

The credentials are then used by the pipeline to:

* Authenticate with Amazon ECR
* Push Docker images
* Configure access to Amazon EKS
* Update Kubernetes deployments

---

# 14. Major Challenges I Solved

This project wasn't just about getting everything running. I encountered and resolved several real infrastructure problems.

### Kubernetes Scheduling

My initial affinity configuration prevented Kubernetes from finding suitable nodes for some pods.

**Solution:** I adjusted the scheduling rules to allow proper workload distribution across the available nodes.

### EBS CSI Driver

The EBS CSI controller initially failed because the required AWS EC2 permission was missing.

The controller reported an authorization failure involving:

```text
ec2:DescribeAvailabilityZones
```

I traced the error through the Kubernetes logs, identified the IAM issue, corrected the permissions, and restored the EBS CSI Driver.

### Application Connectivity

I configured communication between:

```text
Frontend → Backend → MongoDB
```

while keeping the appropriate services internal to the Kubernetes cluster.

### CI/CD Deployment

I automated the entire release process so that application changes could move from source code to production deployment without manually rebuilding and updating Kubernetes workloads.

---

# 15. Final Technology Stack

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
