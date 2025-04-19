import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as session from 'express-session';
import * as passport from 'passport';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;
  
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'super-secret-key',
      resave: false,             // don’t save session if unmodified
      saveUninitialized: false,  // don’t create session until something stored
      cookie: { maxAge: 86400000 }, // 1 day in ms
    }),
  );

  // 2. Initialize Passport (order matters)
  app.use(passport.initialize());
  app.use(passport.session());

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();