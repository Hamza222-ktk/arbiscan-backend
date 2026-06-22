import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ScalpService } from './scalp.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'ws/scalp',
})
export class ScalpGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ScalpGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly scalpService: ScalpService) {
    // Register callback so when a scalp changes status (added or expired), we broadcast
    this.scalpService.registerOnScalpCallback(() => this.broadcastUpdates());
  }

  handleConnection(client: Socket) {
    this.logger.log(`Scalp stream client connected: ${client.id}`);
    // Emit current active scalps immediately on connect
    this.scalpService.getLiveScalps().then(scalps => {
      client.emit('scalp_update', scalps);
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Scalp stream client disconnected: ${client.id}`);
  }

  async broadcastUpdates() {
    this.logger.log('Broadcasting latest scalp signals via WebSocket...');
    if (this.server) {
      const activeScalps = await this.scalpService.getLiveScalps();
      this.server.emit('scalp_update', activeScalps);
    }
  }
}
