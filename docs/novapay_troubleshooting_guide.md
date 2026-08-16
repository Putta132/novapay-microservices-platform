# 🎯 NovaPay — Real-World DevOps Interview Troubleshooting & Error Guide

> **Total Errors Documented: 15**

> **How to use this document for interview prep:**
> Interviewers frequently ask: *"What were the most challenging bugs or issues you encountered in your project, and how did you debug them?"* 
> 
> This document details the **15 real-world DevOps errors**, exact diagnostic steps, root causes, and resolutions from building NovaPay. Use the **"Interview Answer Pitch"** section under each issue to speak confidently in technical interviews!

---

## 📋 Quick Error Summary Matrix

| # | Error Message / Symptom | Root Cause | Fix / Resolution |
|---|---|---|---|
| 1 | `npm ci exit code: 1` | `npm ci` requires pre-existing `package-lock.json` | Replaced with `npm install --omit=dev` in Dockerfiles |
| 2 | `ENOENT: no such file or directory package.json` / `"/index.html": not found` | Linux containers are case-sensitive (`Package.json` vs `package.json`) | Renamed files to exact lowercase (`package.json`, `index.html`) |
| 3 | `init.sql: error: Is a directory` | Docker mounted `./db/init.sql` before file existed on host | Removed directory, recreated file `db/init.sql`, ran `docker compose down -v` |
| 4 | `novapay-platform-redis-1 has no healthcheck configured` | `depends_on: {condition: service_healthy}` used without Redis `healthcheck:` | Added `redis-cli ping` healthcheck to `redis` in `docker-compose.yml` |
| 5 | `MODULE_NOT_FOUND` (`gatewayCache.js`) | Microservice Dockerfiles copied `src/`, omitting shared `infrastructure/` | Synced `infrastructure/` to context, updated Dockerfile `COPY`, fixed relative paths |
| 6 | `Kafka is not defined` / `getaddrinfo EAI_AGAIN kafka` | Missing `require('kafkajs')` & missing `kafka`/`zookeeper` broker services | Added `kafkajs` import to `kafkaClient.js` & added Kafka/Zookeeper to Compose |
| 7 | `nginx: [emerg] unknown "gateway_url" variable` | Nginx parsed `${GATEWAY_URL}` as unconfigured internal Nginx variable | Updated `nginx.conf` to serve static `API_BASE` & proxy `/api/` to Gateway |
| 8 | `Router.use() requires a middleware function but got a Object` | `src/routes/auth.js` contained exported middleware object instead of Router | Restored `express.Router()` in `routes/auth.js` exporting `router` |
| 9 | UI error: `Failed to fetch` | Cross-origin request from Port 80 to 3002 blocked by browser CORS | Added `cors` middleware to Gateway & routed `/api/*` through same-origin Nginx proxy |
| 10 | `ResourceInUseException: Cluster has nodegroups attached` | Terraform tried to delete EKS Cluster before Node Group deletion completed | Manually deleted Node Group via AWS Console first, then re-ran `terraform destroy` |
| 11 | `helm lint` → `The system cannot find the path specified` | Running `helm lint` outside the chart directory caused path resolution errors | Navigated inside the chart directory and used `helm lint .` |
| 12 | `exec: executable aws not found` | VS Code terminal spawned without refreshed PATH variables after AWS CLI install | Switched back to initial terminal tab or spawned standard Windows PowerShell |
| 13 | `ECR Repository not empty` | Terraform `aws_ecr_repository` lacked `force_delete=true`, blocking destruction | Updated `main.tf` with `force_delete = true` and re-applied |
| 14 | `DependencyViolation: Network has mapped public address(es)` | Kubernetes LoadBalancer services created AWS ELBs outside Terraform state | Manually deleted ELBs in AWS EC2 Console before running `terraform destroy` |
| 15 | Grafana Default Admin Login Failed | Helm chart auto-generated a random admin password stored securely in Secrets | Re-ran `helm upgrade` explicitly passing `--set grafana.adminPassword=admin123` |

---

## 🛠️ Detailed Case Studies & Interview Pitches

### 1️⃣ Issue 1: `npm ci` Clean Install Failure in Docker Builds

#### ❌ Error Log:
```text
failed to solve: process "/bin/sh -c npm ci --only=production && npm cache clean --force" did not complete successfully: exit code: 1
```

#### 🔍 Root Cause Analysis:
`npm ci` (Clean Install) is designed for CI/CD environments and **strictly requires a pre-existing `package-lock.json` file**. Because we created `package.json` manually without running a local `npm install` first to generate a lockfile, `npm ci` inside the Alpine Linux container failed.

#### 💡 Resolution:
Updated all 7 microservice Dockerfiles to use `npm install --omit=dev`:
```dockerfile
# BEFORE:
RUN npm ci --only=production && npm cache clean --force

# AFTER:
RUN npm install --omit=dev && npm cache clean --force
```

#### 🎙️ How to Answer in an Interview:
> *"When containerizing our Node.js microservices, the initial Docker builds failed on `npm ci`. I investigated the logs and recalled that `npm ci` requires a `package-lock.json` to guarantee deterministic builds. Since we were generating new service manifests without checked-in lockfiles, I modified the Dockerfiles to use `npm install --omit=dev` for production dependencies, ensuring clean container compilation."*

---

### 2️⃣ Issue 2: Cross-Platform File Casing Mismatch (Windows Host vs. Linux Container)

#### ❌ Error Logs:
```text
npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/app/package.json'
target frontend-service: failed to solve: "/index.html": not found
```

#### 🔍 Root Cause Analysis:
Windows NTFS filesystems are **case-insensitive**, while Linux filesystems inside Docker containers are strictly **case-sensitive**. On the host machine, `Package.json` and `Index.html` were named with capital first letters. Windows handled this silently, but inside the Alpine Linux container (`node:18-alpine` / `nginx:1.25-alpine`), Docker looked for exact lowercase `package.json` and `index.html`, throwing `ENOENT` / `not found`.

#### 💡 Resolution:
Inspected directory listings using PowerShell `Get-ChildItem -File` and renamed all affected files to strict lowercase:
```powershell
Rename-Item -Path "services\auth-service\Package.json" -NewName "package.json"
Rename-Item -Path "services\frontend-service\Index.html" -NewName "index.html"
```

#### 🎙️ How to Answer in an Interview:
> *"I encountered a classic cross-platform issue where Docker builds succeeded locally in mindset but failed inside the Linux builder. Using container build logs, I identified that the files were named with capitalized first letters (`Package.json` and `Index.html`). While Windows treats filesystem paths case-insensitively, Linux inside Docker containers is strictly case-sensitive. I established a naming convention rule and renamed all files to strict lowercase, fixing the build."*

---

### 3️⃣ Issue 3: Docker Volume Mount Creating Directory Instead of File (`init.sql`)

#### ❌ Error Log:
```text
postgres-1 | /usr/local/bin/docker-entrypoint.sh: running /docker-entrypoint-initdb.d/init.sql
postgres-1 | psql:/docker-entrypoint-initdb.d/init.sql: error: could not read from input file: Is a directory
```

#### 🔍 Root Cause Analysis:
In `docker-compose.yml`, PostgreSQL was configured with a bind mount volume:
`- ./db/init.sql:/docker-entrypoint-initdb.d/init.sql`
When `docker compose up` was initially executed before `init.sql` was created on the host disk, **Docker default behavior automatically created a directory named `init.sql`** on the host. When PostgreSQL initialized, `psql` tried to read `/docker-entrypoint-initdb.d/init.sql` as a SQL script, but failed because it was a folder!

#### 💡 Resolution:
1. Removed the auto-created `db/init.sql` directory.
2. Created the real `db/init.sql` file containing all 5 service database schemas.
3. Reset PostgreSQL data volume to force a clean re-initialization:
   ```powershell
   Remove-Item -Path "db\init.sql" -Recurse -Force
   # (Recreated db/init.sql file)
   docker compose down -v
   ```

#### 🎙️ How to Answer in an Interview:
> *"During database bootstrapping, PostgreSQL crashed with `Is a directory` on `init.sql`. I traced this to a Docker bind-mount quirk: if a host path specified in a volume mount does not exist prior to container startup, Docker creates an empty directory at that location. I removed the directory, wrote the schema file, and ran `docker compose down -v` to flush stale volumes and re-run initialization scripts cleanly."*

---

### 4️⃣ Issue 4: Docker Compose Healthcheck Dependency Deadlock

#### ❌ Error Log:
```text
dependency failed to start: container novapay-platform-redis-1 has no healthcheck configured
```

#### 🔍 Root Cause Analysis:
In `docker-compose.yml`, microservices (like `auth-service` and `account-service`) were configured with dependent health conditions:
```yaml
depends_on:
  postgres: {condition: service_healthy}
  redis: {condition: service_healthy}
```
While `postgres` had a `healthcheck:` section defined (`pg_isready`), `redis` only had container ports and commands defined, with **no `healthcheck:` block**. Docker Compose aborted startup because it cannot evaluate `service_healthy` on a container without a healthcheck.

#### 💡 Resolution:
Added a native `redis-cli ping` healthcheck to the Redis service definition in `docker-compose.yml`:
```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 5
```

#### 🎙️ How to Answer in an Interview:
> *"When enforcing startup ordering in Docker Compose using `depends_on: {condition: service_healthy}`, Docker Compose failed because the Redis container lacked a healthcheck definition. I implemented a `redis-cli ping` health check probe with 5s evaluation intervals, ensuring downstream microservices only launch once Redis is confirmed ready."*

---

### 5️⃣ Issue 5: Missing Shared Infrastructure & Isolated Build Context (`MODULE_NOT_FOUND`)

#### ❌ Error Log:
```text
gateway-service-1 | code: 'MODULE_NOT_FOUND',
gateway-service-1 | requireStack: [ '/app/src/redis/gatewayCache.js', '/app/src/index.js' ]
```

#### 🔍 Root Cause Analysis:
Microservices rely on shared utilities (`infrastructure/redis/redisClient.js` and `infrastructure/kafka/kafkaClient.js`). 
In `docker-compose.yml`, each microservice built from its own folder (`build: ./services/gateway-service`). The service Dockerfile only copied `COPY src/ ./src/`. Inside the container `/app`, the path `../../../../infrastructure/` did not exist.

#### 💡 Resolution:
1. Extracted all shared Kafka/Redis client helper files to `infrastructure/`.
2. Synced `infrastructure/` into each service build directory.
3. Updated service Dockerfiles to copy `infrastructure/`:
   ```dockerfile
   COPY infrastructure/ ./infrastructure/
   COPY src/ ./src/
   ```
4. Adjusted relative require statements:
   ```javascript
   const { checkRateLimit } = require('../../infrastructure/redis/redisClient');
   ```

#### 🎙️ How to Answer in an Interview:
> *"I diagnosed a `MODULE_NOT_FOUND` error in `gateway-service`. In our multi-service repo, services rely on shared Redis and Kafka client helpers. Because each service's Docker build context was scoped to its own subfolder, the shared `infrastructure/` directory was excluded from container images. I updated our build strategy to include the shared module in the context and updated Dockerfiles to copy `./infrastructure` into `/app/infrastructure`, enabling seamless module resolution."*

---

### 6️⃣ Issue 6: Missing Kafka Library Import & Unreachable Kafka Broker (`EAI_AGAIN kafka`)

#### ❌ Error Logs:
```text
transaction-service-1 | {"error":"Kafka is not defined","level":"error","message":"Failed to start Kafka consumer"}
transaction-service-1 | [BrokerPool] Failed to connect to seed broker, trying another: Connection timeout, broker: "kafka:9092", stack: "Error: getaddrinfo EAI_AGAIN kafka"
```

#### 🔍 Root Cause Analysis:
Two distinct bugs caused event-driven services (`payment-service`, `transaction-service`, `notification-service`) to fail:
1. `infrastructure/kafka/kafkaClient.js` attempted to instantiate `new Kafka({...})` without importing `const { Kafka, logLevel } = require('kafkajs');`.
2. The `kafka` and `zookeeper` containers were missing from `docker-compose.yml`, causing DNS lookup for host `kafka:9092` to fail (`EAI_AGAIN kafka`).

#### 💡 Resolution:
1. Added missing `kafkajs` import to `kafkaClient.js`.
2. Added **Zookeeper** (`confluentinc/cp-zookeeper:7.5.0`) and **Kafka** (`confluentinc/cp-kafka:7.5.0`) to `docker-compose.yml`.
3. Set environment variable `KAFKA_BROKERS: kafka:9092` on all event-driven microservices.

#### 🎙️ How to Answer in an Interview:
> *"When testing event-driven communication between `payment-service` and `transaction-service`, I observed DNS lookup timeouts (`EAI_AGAIN kafka`) and JavaScript runtime errors. I resolved the runtime issue by fixing missing library imports in our shared `kafkaClient.js` wrapper. For networking, I added Zookeeper and Kafka broker containers to Docker Compose on a shared bridge network, allowing microservices to discover `kafka:9092` via container DNS."*

---

### 7️⃣ Issue 7: Nginx Configuration Variable Parsing Error (`unknown "gateway_url" variable`)

#### ❌ Error Log:
```text
2026/08/10 17:09:27 [emerg] 1#1: unknown "gateway_url" variable
nginx: [emerg] unknown "gateway_url" variable
```

#### 🔍 Root Cause Analysis:
In `frontend-service/nginx.conf`, the configuration contained:
```nginx
location = /config.js {
    return 200 "window.API_BASE='${GATEWAY_URL}';";
}
```
When Nginx started, its configuration parser treated `${GATEWAY_URL}` as an internal Nginx variable (like `$host` or `$uri`). Because Nginx did not recognize `gateway_url`, the Nginx master process crashed during startup.

#### 💡 Resolution:
Replaced the unparsed Nginx variable in `nginx.conf` with a static config endpoint and configured Nginx `location /api/` reverse proxying to route `/api/*` traffic directly to `gateway-service:3002`:
```nginx
location = /config.js {
    add_header Content-Type application/javascript;
    return 200 "window.API_BASE='';";
}

location /api/ {
    proxy_pass http://gateway-service:3002/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

#### 🎙️ How to Answer in an Interview:
> *"Our Nginx frontend web server crashed on launch with `unknown "gateway_url" variable`. I realized that Nginx was attempting to interpolate `${GATEWAY_URL}` as an internal Nginx directive instead of an environment variable. I resolved this by refactoring Nginx to serve a static runtime script and using Nginx's `proxy_pass` directive to route `/api/` calls directly to the API Gateway."*

---

### 8️⃣ Issue 8: Express Router Export Mismatch (`Router.use() requires a middleware function`)

#### ❌ Error Log:
```text
TypeError: Router.use() requires a middleware function but got a Object
    at Function.use (/app/node_modules/express/lib/router/index.js:469:13)
    at Object.<anonymous> (/app/src/index.js:28:5)
```

#### 🔍 Root Cause Analysis:
In `auth-service/src/index.js`, line 28 declared:
`app.use('/api/auth', authRoutes);`
However, `services/auth-service/src/routes/auth.js` contained `module.exports = { authenticate };` (the middleware export) instead of the `express.Router()` object, causing Express to throw `Router.use() requires a middleware function but got a Object`.

#### 💡 Resolution:
Restored the complete `express.Router()` implementation in `routes/auth.js` with `/register`, `/login`, `/verify`, `/refresh`, `/logout` endpoints, exporting `module.exports = router;`.

#### 🎙️ How to Answer in an Interview:
> *"During `auth-service` startup, Express crashed with a `TypeError` indicating `Router.use()` received an Object instead of a Middleware function. I inspected `src/routes/auth.js` and discovered an export mismatch: the route file was exporting a named middleware object `{ authenticate }` instead of an `express.Router()` instance. I fixed the module exports, allowing Express to mount `/api/auth` routes correctly."*

---

### 9️⃣ Issue 9: Browser CORS Preflight Blocking (`Failed to fetch`)

#### ❌ Symptom:
Browser UI on `http://localhost` displayed a red error box **`Failed to fetch`** when clicking **"Create Account"**.

#### 🔍 Root Cause Analysis:
The browser loaded the Web Dashboard at `http://localhost` (Port 80) and attempted to send an HTTP `POST` request to `http://localhost:3002` (`gateway-service`). The browser issued an HTTP `OPTIONS` preflight request. Because `gateway-service` had not enabled `cors` middleware, the browser blocked the response due to strict Same-Origin Policy (CORS).

#### 💡 Resolution:
1. Added `"cors": "^2.8.5"` to `gateway-service/package.json` and enabled `app.use(cors())` in `gateway-service/src/index.js`.
2. Configured Nginx to proxy `/api/*` requests on the **same origin** (`http://localhost/api/...`), ensuring requests match the same host and port.

#### 🎙️ How to Answer in an Interview:
> *"When submitting forms from our frontend single-page app, the browser threw `Failed to fetch`. Inspecting Network DevTools showed a CORS preflight failure (`OPTIONS 405/Cross-Origin Blocked`). I implemented a two-fold fix: enabled CORS middleware on the API Gateway for cross-origin flexibility, and configured Nginx to proxy `/api/*` requests on the same origin (`http://localhost/api`), preventing CORS overhead altogether in production."*

---

### 🔟 Issue 10: EKS Node Group Deletion Timeout (`ResourceInUseException`)

#### ❌ Error Log:
```text
Error: deleting EKS Cluster (novapay-eks-cluster): operation error EKS: DeleteCluster, https response error StatusCode: 409, ResourceInUseException: Cluster has nodegroups attached
```

#### 🔍 Root Cause Analysis:
When running `terraform destroy`, Terraform instructs AWS to delete the managed Node Group and the EKS Cluster. Because EC2 instances take several minutes to terminate, Terraform occasionally times out waiting on the Node Group and attempts to delete the cluster prematurely, which AWS strictly forbids.

#### 💡 Resolution:
Deleted the attached Node Group manually from the AWS Console (Compute Tab), then ran `terraform destroy --auto-approve` again to allow Terraform to cleanly finish the state destruction.

#### 🎙️ How to Answer in an Interview:
> *"During Infrastructure-as-Code teardown, Terraform crashed with a `ResourceInUseException`. I identified this as an eventual-consistency timeout issue where Terraform attempted to delete the EKS control plane before the worker node groups had fully terminated. I resolved this by manually executing the node group deletion in the AWS API to unblock the dependency graph, then re-ran `terraform destroy` to cleanly clear the state."*

---

### 1️⃣1️⃣ Issue 11: Missing PATH Variables in New VS Code Terminals (`aws not found`)

#### ❌ Error Log:
```text
exec: executable aws not found
It looks like you are trying to use a client-go credential plugin that is not installed.
```

#### 🔍 Root Cause Analysis:
When attempting to run `kubectl get pods` in a newly opened VS Code terminal tab, the command failed to authenticate. The AWS CLI had been installed during the current VS Code session. Windows does not automatically propagate new system `PATH` variables to child processes like VS Code until the application is restarted.

#### 💡 Resolution:
Switched back to the original terminal tab where the PATH was loaded, or spawned a standard Windows PowerShell window entirely outside of VS Code to execute `kubectl` commands.

#### 🎙️ How to Answer in an Interview:
> *"While multitasking during a load test, `kubectl` authentication suddenly failed in a secondary terminal with `aws not found`. I realized that because I had installed the AWS CLI within the same active VS Code session, the new integrated terminal tab did not inherit the updated System PATH variables. Instead of interrupting my workflow by restarting the IDE, I simply spawned an external PowerShell process to bypass the IDE's stale environment variables."*

---

### 1️⃣2️⃣ Issue 12: ECR Repository Destruction Blocked (`RepositoryNotEmptyException`)

#### ❌ Error Log:
```text
Error: ECR Repository (novapay/notification-service) not empty, consider using force_delete
RepositoryNotEmptyException: The repository with name 'novapay/notification-service' cannot be deleted because it still contains images
```

#### 🔍 Root Cause Analysis:
By default, AWS prevents the deletion of Elastic Container Registry (ECR) repositories if they contain Docker images, serving as a safety mechanism. Terraform honors this API restriction and fails the destroy operation.

#### 💡 Resolution:
Modified the `aws_ecr_repository` resource in `main.tf` to include `force_delete = true`. Re-ran `terraform apply` to register the change in state, followed by `terraform destroy`, allowing AWS to aggressively wipe the images and the repository.

#### 🎙️ How to Answer in an Interview:
> *"When destroying the environment to optimize costs, Terraform failed on the ECR resources due to a `RepositoryNotEmptyException`. AWS prevents non-empty repository deletion by default to prevent accidental data loss. I modified the Terraform configuration to explicitly declare `force_delete = true` on the ECR module, ensuring idempotent and guaranteed teardown of all CI/CD artifacts during environment destruction."*

---

### 1️⃣3️⃣ Issue 13: Leftover Load Balancers Blocking VPC Deletion (`DependencyViolation`)

#### ❌ Error Log:
```text
DependencyViolation: Network vpc-0fc2bae3791ba640e has some mapped public address(es). Please unmap those public address(es) before detaching the gateway.
```

#### 🔍 Root Cause Analysis:
During the project, we deployed `kube-prometheus-stack` (Grafana) and the API Gateway into Kubernetes as `LoadBalancer` services. Kubernetes communicated with the AWS API to automatically provision AWS Elastic Load Balancers (ELBs). Because Terraform did not provision these ELBs, they were not tracked in the Terraform state file. When Terraform tried to delete the VPC, AWS blocked the action because those "orphan" ELBs were still consuming public IPs within the subnets.

#### 💡 Resolution:
Identified the rogue ELBs via the AWS EC2 Management Console and manually deleted them, which freed the public IPs and allowed Terraform to successfully delete the Internet Gateway and VPC.

#### 🎙️ How to Answer in an Interview:
> *"I encountered a `DependencyViolation` when tearing down a VPC using Terraform. I diagnosed that Kubernetes had dynamically provisioned AWS Load Balancers for our ingress services outside of Terraform's state management. Because Terraform was unaware of these ELBs, it couldn't delete them, causing a dependency lock on the VPC's public subnets. I manually purged the orphaned load balancers from the AWS API to resolve the drift and unblock the infrastructure teardown."*

---

### 1️⃣4️⃣ Issue 14: Grafana Default Admin Password Authentication Failure

#### ❌ Symptom:
Unable to login to the deployed Grafana dashboard at `localhost:8081` using standard credentials (`admin` / `prom-operator`).

#### 🔍 Root Cause Analysis:
When deploying the `kube-prometheus-stack` Helm chart, it auto-generates a strong, random administrator password and stores it in a Kubernetes Secret if one is not explicitly provided, overriding legacy default passwords.

#### 💡 Resolution:
Re-ran the Helm deployment, explicitly injecting a known password using the `--set` flag:
```powershell
helm upgrade kube-prom prometheus-community/kube-prometheus-stack --reuse-values --set grafana.adminPassword=admin123
```

#### 🎙️ How to Answer in an Interview:
> *"After provisioning our observability stack via the `kube-prometheus-stack` Helm chart, I was locked out of the Grafana dashboard. I investigated the Helm chart documentation and discovered it defaults to generating random secure passwords stored in Kubernetes Secrets rather than using legacy static defaults. To standardize access for my team, I executed a `helm upgrade`, overriding the `grafana.adminPassword` value to enforce a known credential policy."*
