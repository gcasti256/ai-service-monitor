{{/*
Expand the name of the chart.
*/}}
{{- define "ai-service-monitor.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "ai-service-monitor.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart label
*/}}
{{- define "ai-service-monitor.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "ai-service-monitor.labels" -}}
helm.sh/chart: {{ include "ai-service-monitor.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: ai-service-monitor
{{- end }}

{{/*
Server labels
*/}}
{{- define "ai-service-monitor.server.labels" -}}
{{ include "ai-service-monitor.labels" . }}
app.kubernetes.io/name: server
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Server selector labels
*/}}
{{- define "ai-service-monitor.server.selectorLabels" -}}
app.kubernetes.io/name: server
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Dashboard labels
*/}}
{{- define "ai-service-monitor.dashboard.labels" -}}
{{ include "ai-service-monitor.labels" . }}
app.kubernetes.io/name: dashboard
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Dashboard selector labels
*/}}
{{- define "ai-service-monitor.dashboard.selectorLabels" -}}
app.kubernetes.io/name: dashboard
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Server image
*/}}
{{- define "ai-service-monitor.server.image" -}}
{{- $tag := default .Chart.AppVersion .Values.server.image.tag }}
{{- printf "%s:%s" .Values.server.image.repository $tag }}
{{- end }}

{{/*
Dashboard image
*/}}
{{- define "ai-service-monitor.dashboard.image" -}}
{{- $tag := default .Chart.AppVersion .Values.dashboard.image.tag }}
{{- printf "%s:%s" .Values.dashboard.image.repository $tag }}
{{- end }}
