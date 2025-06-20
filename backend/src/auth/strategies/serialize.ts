import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
    constructor(private readonly databaseService:DatabaseService) {
        super();
      }
      serializeUser(user: any, done: Function) {
        done(null, user.id);
      }
      async deserializeUser(id: number, done: Function) {
        try {
            const user = await this.databaseService.user.findUnique({
                where: { id },
              });
          done(null, user);
        } catch (err) {
          done(err, null);
        }
      }
    
}
