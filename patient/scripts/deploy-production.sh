#!/bin/bash

# Production Deployment Script for Patient Frontend
# This script handles environment setup, build, and deployment verification

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENTS=("development" "staging" "production")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    echo "Usage: $0 [ENVIRONMENT] [OPTIONS]"
    echo ""
    echo "ENVIRONMENTS:"
    echo "  development  - Build for development (default)"
    echo "  staging      - Build for staging environment"
    echo "  production   - Build for production environment"
    echo ""
    echo "OPTIONS:"
    echo "  --skip-tests       Skip connection tests"
    echo "  --skip-build       Skip the build process"
    echo "  --skip-validation  Skip environment validation"
    echo "  --dry-run          Show what would be done without executing"
    echo "  --help, -h         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 production                    # Full production build and test"
    echo "  $0 staging --skip-tests          # Staging build without tests"
    echo "  $0 development --dry-run         # Show development build plan"
}

# Parse command line arguments
ENVIRONMENT="development"
SKIP_TESTS=false
SKIP_BUILD=false
SKIP_VALIDATION=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        development|staging|production)
            ENVIRONMENT="$1"
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! " ${ENVIRONMENTS[@]} " =~ " ${ENVIRONMENT} " ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    log_info "Valid environments: ${ENVIRONMENTS[*]}"
    exit 1
fi

# Header
echo "=========================================="
echo "🚀 Patient Frontend Production Deployment"
echo "=========================================="
log_info "Environment: $ENVIRONMENT"
log_info "Project Directory: $PROJECT_DIR"
log_info "Skip Tests: $SKIP_TESTS"
log_info "Skip Build: $SKIP_BUILD"
log_info "Skip Validation: $SKIP_VALIDATION"
log_info "Dry Run: $DRY_RUN"
echo "=========================================="

# Change to project directory
cd "$PROJECT_DIR"

# Function to run command with dry-run support
run_command() {
    local cmd="$1"
    local description="$2"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute: $cmd"
        if [[ -n "$description" ]]; then
            log_info "[DRY RUN] Purpose: $description"
        fi
    else
        log_info "Executing: $cmd"
        if [[ -n "$description" ]]; then
            log_info "Purpose: $description"
        fi
        eval "$cmd"
    fi
}

# 1. Environment validation
if [[ "$SKIP_VALIDATION" != "true" ]]; then
    log_info "🔍 Step 1: Environment Validation"
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ to continue."
        exit 1
    fi
    
    # Check Node version
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$NODE_VERSION" -lt 18 ]]; then
        log_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    log_success "Node.js version: $(node --version)"
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    log_success "npm version: $(npm --version)"
    
    # Check if Angular CLI is available
    if ! command -v ng &> /dev/null; then
        log_warning "Angular CLI not found globally. Installing locally..."
        run_command "npm install -g @angular/cli" "Install Angular CLI globally"
    fi
    log_success "Angular CLI version: $(ng version --skip-confirmation | head -1)"
    
    # Verify package.json exists
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found. Are you in the correct directory?"
        exit 1
    fi
    log_success "package.json found"
    
    # Check environment file
    ENVIRONMENT_FILE="src/environments/environment.$ENVIRONMENT.ts"
    if [[ "$ENVIRONMENT" == "development" ]]; then
        ENVIRONMENT_FILE="src/environments/environment.ts"
    fi
    
    if [[ ! -f "$ENVIRONMENT_FILE" ]]; then
        log_error "Environment file not found: $ENVIRONMENT_FILE"
        exit 1
    fi
    log_success "Environment file found: $ENVIRONMENT_FILE"
    
else
    log_warning "Skipping environment validation"
fi

# 2. Dependencies installation
log_info "📦 Step 2: Dependencies Installation"
if [[ ! -d "node_modules" ]] || [[ "$DRY_RUN" == "false" ]]; then
    run_command "npm ci" "Install production dependencies"
else
    log_success "Dependencies already installed"
fi

# 3. Pre-build validation
if [[ "$SKIP_VALIDATION" != "true" ]]; then
    log_info "🔍 Step 3: Pre-build Validation"
    
    # Lint check
    log_info "Running linter..."
    if [[ "$DRY_RUN" == "false" ]]; then
        if npm run lint > /dev/null 2>&1; then
            log_success "Lint check passed"
        else
            log_warning "Lint check failed - continuing anyway"
        fi
    else
        log_info "[DRY RUN] Would run: npm run lint"
    fi
    
    # Type checking
    log_info "Running type check..."
    if [[ "$DRY_RUN" == "false" ]]; then
        if npx tsc --noEmit; then
            log_success "Type check passed"
        else
            log_error "Type check failed"
            exit 1
        fi
    else
        log_info "[DRY RUN] Would run: npx tsc --noEmit"
    fi
    
else
    log_warning "Skipping pre-build validation"
fi

# 4. Backend connectivity test
if [[ "$SKIP_TESTS" != "true" ]]; then
    log_info "🔗 Step 4: Backend Connectivity Test"
    
    if [[ -f "scripts/test-production-connection.js" ]]; then
        run_command "node scripts/test-production-connection.js $ENVIRONMENT" "Test backend connectivity"
        
        if [[ "$DRY_RUN" == "false" && $? -ne 0 ]]; then
            log_error "Backend connectivity test failed"
            if [[ "$ENVIRONMENT" == "production" ]]; then
                log_error "Cannot proceed with production build - backend is not accessible"
                exit 1
            else
                log_warning "Backend connectivity issues detected - continuing anyway for $ENVIRONMENT"
            fi
        fi
    else
        log_warning "Backend connectivity test script not found"
    fi
else
    log_warning "Skipping backend connectivity tests"
fi

# 5. Build process
if [[ "$SKIP_BUILD" != "true" ]]; then
    log_info "🏗️  Step 5: Build Process"
    
    # Determine build configuration
    BUILD_CONFIG="$ENVIRONMENT"
    if [[ "$ENVIRONMENT" == "development" ]]; then
        BUILD_CONFIG="development"
    fi
    
    # Clean previous build
    if [[ -d "www" ]]; then
        run_command "rm -rf www" "Clean previous build"
    fi
    
    # Build the application
    BUILD_CMD="ng build --configuration=$BUILD_CONFIG"
    
    # Add production optimizations
    if [[ "$ENVIRONMENT" == "production" ]]; then
        BUILD_CMD="$BUILD_CMD --optimization --build-optimizer --aot"
    fi
    
    run_command "$BUILD_CMD" "Build Angular application for $ENVIRONMENT"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        if [[ ! -d "www" ]]; then
            log_error "Build failed - output directory not created"
            exit 1
        fi
        log_success "Build completed successfully"
        
        # Show build statistics
        if [[ -d "www" ]]; then
            BUILD_SIZE=$(du -sh www 2>/dev/null | cut -f1)
            log_info "Build size: $BUILD_SIZE"
            
            # Count files
            FILE_COUNT=$(find www -type f | wc -l)
            log_info "Files generated: $FILE_COUNT"
        fi
    fi
else
    log_warning "Skipping build process"
fi

# 6. Post-build validation
if [[ "$SKIP_BUILD" != "true" && "$DRY_RUN" == "false" ]]; then
    log_info "✅ Step 6: Post-build Validation"
    
    # Check critical files
    CRITICAL_FILES=("www/index.html" "www/main.js")
    
    for file in "${CRITICAL_FILES[@]}"; do
        if [[ -f "$file" ]]; then
            log_success "Critical file found: $file"
        else
            log_error "Critical file missing: $file"
            exit 1
        fi
    done
    
    # Check for source maps in production
    if [[ "$ENVIRONMENT" == "production" ]]; then
        SOURCE_MAPS=$(find www -name "*.map" | wc -l)
        if [[ "$SOURCE_MAPS" -gt 0 ]]; then
            log_warning "Source maps found in production build ($SOURCE_MAPS files)"
            log_warning "Consider disabling source maps for production"
        else
            log_success "No source maps in production build"
        fi
    fi
    
    # Validate environment configuration in build
    if [[ -f "www/main.js" ]]; then
        if grep -q "localhost" www/main.js && [[ "$ENVIRONMENT" == "production" ]]; then
            log_error "Production build contains localhost references"
            exit 1
        fi
        log_success "Build environment configuration validated"
    fi
else
    log_warning "Skipping post-build validation"
fi

# 7. Deployment preparation
log_info "📦 Step 7: Deployment Preparation"

if [[ "$DRY_RUN" == "false" && -d "www" ]]; then
    # Create deployment package
    DEPLOY_PACKAGE="patient-app-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    log_info "Creating deployment package: $DEPLOY_PACKAGE"
    tar -czf "$DEPLOY_PACKAGE" -C www .
    
    if [[ -f "$DEPLOY_PACKAGE" ]]; then
        PACKAGE_SIZE=$(du -sh "$DEPLOY_PACKAGE" | cut -f1)
        log_success "Deployment package created: $DEPLOY_PACKAGE ($PACKAGE_SIZE)"
        
        # Generate deployment manifest
        MANIFEST_FILE="deployment-manifest-$ENVIRONMENT.json"
        cat > "$MANIFEST_FILE" << EOF
{
  "environment": "$ENVIRONMENT",
  "buildTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "packageFile": "$DEPLOY_PACKAGE",
  "packageSize": "$PACKAGE_SIZE",
  "nodeVersion": "$(node --version)",
  "angularVersion": "$(ng version --skip-confirmation | grep -o '@angular/.*' | head -1)",
  "buildConfiguration": {
    "optimization": $([ "$ENVIRONMENT" = "production" ] && echo "true" || echo "false"),
    "sourceMap": $([ "$ENVIRONMENT" != "production" ] && echo "true" || echo "false"),
    "aot": true
  }
}
EOF
        log_success "Deployment manifest created: $MANIFEST_FILE"
    else
        log_error "Failed to create deployment package"
        exit 1
    fi
else
    log_info "[DRY RUN] Would create deployment package"
fi

# 8. Final summary
echo "=========================================="
log_success "🎉 Deployment Process Complete"
echo "=========================================="
log_info "Environment: $ENVIRONMENT"
log_info "Build Status: $([ "$SKIP_BUILD" = "true" ] && echo "Skipped" || echo "Complete")"
log_info "Tests Status: $([ "$SKIP_TESTS" = "true" ] && echo "Skipped" || echo "Complete")"
log_info "Dry Run: $DRY_RUN"

if [[ "$DRY_RUN" == "false" && "$SKIP_BUILD" != "true" ]]; then
    log_info "Build Output: www/"
    if [[ -f "$DEPLOY_PACKAGE" ]]; then
        log_info "Deployment Package: $DEPLOY_PACKAGE"
    fi
    if [[ -f "$MANIFEST_FILE" ]]; then
        log_info "Deployment Manifest: $MANIFEST_FILE"
    fi
fi

# Next steps
echo ""
log_info "🚀 Next Steps:"
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "  1. Upload $DEPLOY_PACKAGE to your production server"
    echo "  2. Extract the package to your web server directory"
    echo "  3. Configure your web server (nginx/apache) to serve the files"
    echo "  4. Set up SSL/TLS certificates for HTTPS"
    echo "  5. Configure proper security headers"
    echo "  6. Test the deployed application thoroughly"
else
    echo "  1. Deploy to your $ENVIRONMENT server"
    echo "  2. Run integration tests"
    echo "  3. Verify all features work correctly"
fi

echo "=========================================="
log_success "Deployment script completed successfully!"
