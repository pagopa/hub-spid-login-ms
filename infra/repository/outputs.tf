# Repository module outputs

output "repository_id" {
  description = "The ID of the GitHub repository"
  value       = module.repo.id
}

output "repository_name" {
  description = "The name of the GitHub repository"
  value       = module.repo.name
}