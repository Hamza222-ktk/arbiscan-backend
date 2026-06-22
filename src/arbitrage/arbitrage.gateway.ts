import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ArbitrageService } from './arbitrage.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'ws/arbitrage',
})
export class ArbitrageGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ArbitrageGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly arbitrageService: ArbitrageService) {
    // Register callback so when scanner finishes a scan, we broadcast live
    this.arbitrageService.registerOnScanCallback(() => this.broadcastUpdates());
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    // Immediately send the current opportunities on connect
    client.emit('arbitrage_update', this.arbitrageService.getActiveOpportunities());
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  broadcastUpdates() {
    this.logger.log('Broadcasting latest arbitrage opportunities via WebSocket...');
    if (this.server) {
      this.server.emit('arbitrage_update', this.arbitrageService.getActiveOpportunities());
    }
  }
}
