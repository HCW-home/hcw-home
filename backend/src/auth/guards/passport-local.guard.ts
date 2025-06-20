import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class PassportLocalGuard extends AuthGuard('local') {
    async canActivate(context: ExecutionContext) {
        const result =(await super.canActivate(context)) as boolean;
        const req= context.switchToHttp().getRequest();
        await super.logIn(req); //user.id saved in session
        return result;
        
    }
}
