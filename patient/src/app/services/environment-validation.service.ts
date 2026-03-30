import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable({
 providedIn: 'root'
})
export class EnvironmentValidationService {

 validateEnvironment(): boolean {
  const issues: string[] = [];

  if (!environment.apiUrl) {
   issues.push('❌ API URL is not configured');
  } else if (!environment.apiUrl.includes('localhost:3000')) {
   issues.push('⚠️  API URL might not match backend: ' + environment.apiUrl);
  } else {
   console.log('✅ API URL configured:', environment.apiUrl);
  }

  if (!environment.socketUrl) {
   issues.push('❌ Socket URL is not configured');
  } else {
   console.log('✅ Socket URL configured:', environment.socketUrl);
  }

  console.log('\n📋 Environment Configuration:');
  console.log('Production:', environment.production);
  console.log('API URL:', environment.apiUrl);
  console.log('Socket URL:', environment.socketUrl);

  if (issues.length > 0) {
   console.error('\n🚨 Environment Issues Found:');
   issues.forEach(issue => console.error(issue));
   return false;
  }

  console.log('\n✅ Environment validation passed!');
  return true;
 }

 getBackendHealthStatus(): Promise<boolean> {
  return fetch(`${environment.baseUrl}/v1/health`)
   .then(response => {
    if (response.ok) {
     console.log('✅ Backend is accessible at:', environment.apiUrl);
     return true;
    } else {
     console.error('❌ Backend returned error:', response.status);
     return false;
    }
   })
   .catch(error => {
    console.error('❌ Cannot connect to backend:', error.message);
    return false;
   });
 }

 async validateFullConfiguration(): Promise<boolean> {
  console.log('🔍 Validating Patient Frontend Configuration...\n');

  const envValid = this.validateEnvironment();
  if (!envValid) {
   return false;
  }

  const backendHealthy = await this.getBackendHealthStatus();
  if (!backendHealthy) {
   console.error('❌ Backend is not accessible. Please ensure:');
   console.error('  - Backend server is running on localhost:3000');
   console.error('  - No firewall blocking the connection');
   console.error('  - Correct environment configuration');
   return false;
  }

  console.log('\n✅ Full configuration validation passed!');
  return true;
 }
}
