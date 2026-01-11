export class RobotWebSocket {
    constructor(ip = '192.168.43.1', port = 8080) {
        this.ip = ip;
        this.port = port;
        this.ws = null;
        this.reconnectInterval = 2000;
        this.shouldReconnect = false;

        // Event handlers
        this.onOpen = null;
        this.onClose = null;
        this.onError = null;
        this.onMessage = null;
        
        // Outbound send queue for messages attempted before socket open
        this._sendQueue = [];
    }

    connect() {
        this.shouldReconnect = true;
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        try {
            this.ws = new WebSocket(`ws://${this.ip}:${this.port}/`);

            this.ws.onopen = () => {
                console.log('Connected to Robot WebSocket');
                if (this.onOpen) this.onOpen();

                // Flush queued messages (resolve their promises after sending)
                if (this._sendQueue && this._sendQueue.length) {
                    try {
                        while (this._sendQueue.length) {
                            const item = this._sendQueue.shift();
                            try {
                                console.log('Flushing queued message', item.payload);
                                this.ws.send(JSON.stringify(item.payload));
                                if (item.resolve) item.resolve(true);
                            } catch (err) {
                                if (item.reject) item.reject(err);
                            }
                        }
                    } catch (e) {
                        console.error('Error flushing send queue', e);
                    }
                }
            };

            this.ws.onclose = () => {
                console.log('Disconnected from Robot WebSocket');
                if (this.onClose) this.onClose();
                if (this.shouldReconnect) {
                    setTimeout(() => this.connect(), this.reconnectInterval);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket Error:', error);
                if (this.onError) this.onError(error);
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (this.onMessage) this.onMessage(data);
                } catch (e) {
                    console.error('Error parsing message:', e);
                }
            };
        } catch (e) {
            console.error('Connection failed:', e);
            if (this.shouldReconnect) {
                setTimeout(() => this.connect(), this.reconnectInterval);
            }
        }
    }

    disconnect() {
        this.shouldReconnect = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    send(payload) {
        // Return a promise that resolves when the message is actually sent (or queued)
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                console.log(`WebSocket sending: ${JSON.stringify(payload)}`);
                this.ws.send(JSON.stringify(payload));
                return Promise.resolve(true);
            }
        } catch (e) {
            console.error('WebSocket send immediate failed', e);
            return Promise.reject(e);
        }

        // Not open: queue the message and return a promise that will resolve on flush
        return new Promise((resolve, reject) => {
            console.log(`WebSocket not open, queuing payload: ${JSON.stringify(payload)}`);
            this._sendQueue.push({payload, resolve, reject, queuedAt: Date.now()});
        });
    }

    sendInit(opModeName) {
        console.log(`WebSocket sendInit called with opModeName: ${opModeName}`);
        return this.send({ type: 'INIT_OP_MODE', opModeName });
    }

    sendStart() {
        this.send({ type: 'START_OP_MODE' });
    }

    sendStop() {
        this.send({ type: 'STOP_OP_MODE' });
    }

    requestStatus() {
        return this.send({ type: 'GET_ROBOT_STATUS' });
    }
}
