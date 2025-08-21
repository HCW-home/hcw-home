import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReadMessageDto } from './dto/read-message.dto';

@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService) {}

  async handleConnection(client: Socket, ...args: any[]) {
    const { consultationId } = client.handshake.query;
    client.join(consultationId as string);
  }

  handleDisconnect(client: Socket) {
    const { consultationId } = client.handshake.query;
    client.leave(consultationId as string);
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(client: Socket, payload: { message: CreateMessageDto, file?: Buffer }): Promise<void> {
    const { message, file } = payload;
    const createdMessage = await this.chatService.createMessage(message, file ? { buffer: file } as any : undefined);
    this.server.to(message.consultationId.toString()).emit('newMessage', createdMessage);
  }

  @SubscribeMessage('readMessage')
  async handleReadMessage(client: Socket, payload: ReadMessageDto): Promise<void> {
    await this.chatService.markMessageAsRead(payload);
    this.server.to(payload.consultationId.toString()).emit('messageRead', payload);
  }

  @SubscribeMessage('typing')
  handleTyping(client: Socket, payload: { consultationId: string, isTyping: boolean }): void {
    client.to(payload.consultationId).emit('typing', { userId: client.id, isTyping: payload.isTyping });
  }
}
