# AI Service Monitor Helm Chart

Helm chart for deploying AI Service Monitor to Kubernetes.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.10+
- NGINX Ingress Controller
- cert-manager (for automatic TLS)

## Install

```bash
# Default (development)
helm install ai-monitor ./helm/ai-service-monitor

# Staging
helm install ai-monitor ./helm/ai-service-monitor \
  -f ./helm/ai-service-monitor/values-staging.yaml

# Production
helm install ai-monitor ./helm/ai-service-monitor \
  -f ./helm/ai-service-monitor/values-production.yaml
```

## Upgrade

```bash
helm upgrade ai-monitor ./helm/ai-service-monitor \
  -f ./helm/ai-service-monitor/values-production.yaml
```

## Configuration

See [values.yaml](values.yaml) for all configurable values with documentation.

### Key Values

| Parameter | Description | Default |
|-----------|------------|---------|
| `server.replicaCount` | Server replicas | `2` |
| `server.resources.limits.cpu` | Server CPU limit | `500m` |
| `server.resources.limits.memory` | Server memory limit | `512Mi` |
| `server.autoscaling.enabled` | Enable HPA | `true` |
| `server.autoscaling.maxReplicas` | Max HPA replicas | `10` |
| `dashboard.replicaCount` | Dashboard replicas | `2` |
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.host` | Ingress hostname | `monitor.example.com` |
| `ingress.tls.enabled` | Enable TLS | `true` |

### Secrets

For production, use an external secret manager instead of storing secrets in values files:

```bash
# Using Sealed Secrets
kubeseal --format yaml < secret.yaml > sealed-secret.yaml

# Using External Secrets Operator
# Configure ExternalSecret CRD pointing to AWS Secrets Manager, Vault, etc.
```

## Uninstall

```bash
helm uninstall ai-monitor
kubectl delete namespace ai-monitor
```
