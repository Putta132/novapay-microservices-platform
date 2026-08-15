output "aws_region" {
  description = "AWS Region"
  value       = var.aws_region
}

output "eks_cluster_name" {
  description = "EKS Cluster Name"
  value       = aws_eks_cluster.novapay_eks.name
}

output "eks_cluster_endpoint" {
  description = "EKS Cluster Endpoint"
  value       = aws_eks_cluster.novapay_eks.endpoint
}

output "ecr_repository_urls" {
  description = "ECR Repository URLs for all 7 microservices"
  value = {
    auth         = aws_ecr_repository.services["auth-service"].repository_url
    account      = aws_ecr_repository.services["account-service"].repository_url
    gateway      = aws_ecr_repository.services["gateway-service"].repository_url
    payment      = aws_ecr_repository.services["payment-service"].repository_url
    transaction  = aws_ecr_repository.services["transaction-service"].repository_url
    notification = aws_ecr_repository.services["notification-service"].repository_url
    frontend     = aws_ecr_repository.services["frontend-service"].repository_url
  }
}