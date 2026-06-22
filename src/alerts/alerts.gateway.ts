import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AlertsService } from './alerts.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'ws/alerts',
})
export class AlertsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AlertsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly alertsService: AlertsService) {
    // Register callback so when an alert is fired, we push it instantly
    this.alertsService.registerOnAlertCallback((alert) => this.pushAlert(alert));
  }

  handleConnection(client: Socket) {
    this.logger.log(`Alert client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Alert client disconnected: ${client.id}`);
  }

  pushAlert(alert: any) {
    if (this.server) {
      this.logger.log(`Pushing live alert [${alert.title}] via WebSocket...`);
      this.server.emit('new_alert', alert);
    }
  }
}
