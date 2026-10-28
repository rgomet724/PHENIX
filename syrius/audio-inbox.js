'use strict';
(() => {
  // Les messages de présence et la voix empruntent deux connexions différentes.
  // Valider le groupe choisi et l’ordre serveur sans attendre un écran SSE qui
  // pourrait être plus lent ; le relais a déjà vérifié les droits de diffusion.
  class SyriusAudioInbox {
    constructor({ clientId, getChannel, onPacket, onChannelChange }) {
      this.clientId = clientId; this.getChannel = getChannel; this.onPacket = onPacket; this.onChannelChange = onChannelChange;
      this.serial = 0; this.channel = null;
    }
    resetConnection() { this.serial = 0; }
    receive(packet) {
      const channel = this.getChannel();
      if (!channel || packet.channelId !== channel || packet.from === this.clientId) return false;
      if (Number.isInteger(packet.serial) && packet.serial <= this.serial) return false;
      if (channel !== this.channel) { this.onChannelChange(); this.channel = channel; }
      this.onPacket(packet);
      if (Number.isInteger(packet.serial)) this.serial = packet.serial;
      return true;
    }
  }
  window.SyriusAudioInbox = SyriusAudioInbox;
})();
