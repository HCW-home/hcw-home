import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get(':consultationId')
  getMessages(@Param('consultationId') consultationId: number) {
    return this.chatService.getMessages(consultationId);
  }
}
