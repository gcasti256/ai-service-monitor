# Kubernetes Raw Manifests

Deploy AI Service Monitor to Kubernetes using raw `kubectl` manifests.

## Prerequisites

- Kubernetes cluster 1.25+
- `kubectl` configured for your cluster
- Container images pushed to a registry:
  - `gcasti256/ai-service-monitor-server:latest`
  - `gcasti256/ai-service-monitor-dashboard:latest`
- NGINX Ingress Controller (for ingress)
- cert-manager (for TLS)

## Quick Deploy

```bash
# Create namespace
kubectl apply -f namespace.yaml

# Update secrets with real values
# Edit k8s/server/secret.yaml before applying!
kubectl apply -f server/
kubectl apply -f dashboard/
```

## Verify

```bash
# Check deployments
kubectl -n ai-monitor get deployments

# Check pods are running
kubectl -n ai-monitor get pods

# Check services
kubectl -n ai-monitor get svc

# Check HPA status
kubectl -n ai-monitor get hpa

# Test health endpoint
kubectl -n ai-monitor port-forward svc/server 3100:3100
curl http://localhost:3100/health
```

## Customization

### Change Ingress Hostname

Edit `dashboard/ingress.yaml` and replace `monitor.example.com` with your domain.

### Adjust Resources

Edit `server/deployment.yaml` or `dashboard/deployment.yaml` to modify CPU/memory requests and limits.

### Scale Manually

```bash
kubectl -n ai-monitor scale deployment server --replicas=5
```

## Cleanup

```bash
kubectl delete namespace ai-monitor
```
