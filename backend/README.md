# Setup Instructions

## Getting Started

If you're a beginner, follow these step-by-step instructions to set up the HCW-home project:

### Prerequisites

- Node.js (v16 or higher)
- Yarn package manager
- PostgreSQL database

### Installation Steps

1. **Clone the repository and install dependencies**

```bash
git clone https://github.com/HCW-home/hcw-home.git
cd hcw-home
yarn install
```

2. **Database Setup**

This project uses Prisma ORM with PostgreSQL:

- Install PostgreSQL if you don't have it already
- Create a new database for this project

3. **Environment Configuration**

Create a `.env` file in the root directory of the project:

```bash
cp .env.example .env
```

Edit the `.env` file with your specific configuration:

```
# Environment
NODE_ENV=development   # Options: development, production

# Application
PORT=3000

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/database_name?schema=public"
```

Make sure to replace:

- `username` with your PostgreSQL username
- `password` with your PostgreSQL password
- `database_name` with the name of the database you created

4. **Initialize Prisma**

```bash
yarn prisma generate
yarn prisma migrate dev --name init
```

This will create your database tables according to the Prisma schema and generate the Prisma client.

5. **Start the development server**

```bash
yarn start:dev
```

Your NestJS application should now be running at `http://localhost:3000`!

If you encounter any issues, check the project documentation or create an issue in the GitHub repository.
