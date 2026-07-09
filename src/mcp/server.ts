import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Env } from '@/types/env';
import { VERSION } from '@/constants';

import { announceAlexa } from '@/mcp/tools/announcements';
import { getBedroomState } from '@/mcp/tools/bedroom';
import { listLights, setLightBrightness, setLightColor, setLightPower } from '@/mcp/tools/lights';
import { getMusicStatus } from '@/mcp/tools/music';
import { adjustVolume, getAllDeviceVolumes, setVolume } from '@/mcp/tools/volume';
import { getAllSensorData } from '@/mcp/tools/sensors';
import { listSmartHomeDevices } from '@/mcp/tools/devices';
import { getDndStatus, setDndStatus } from '@/mcp/tools/dnd';

import {
  AlexaAnnounceSchema,
  SetLightBrightnessSchema,
  SetLightColorSchema,
  SetLightPowerSchema,
  SetVolumeSchema,
  AdjustVolumeSchema,
  SetDndStatusSchema,
} from '@/schemas/alexa';

/**
 * Alexa Home Automation MCP Server Logic
 * Uses the official @modelcontextprotocol/sdk.
 */
export class HomeIOMCP {
  private server: McpServer;

  private customEnv?: Env;

  constructor(customEnv?: Env) {
    this.customEnv = customEnv;

    this.server = new McpServer({
      name: 'Alexa Home Automation',
      version: VERSION,
    });
    this.registerTools();
  }

  private getEnv(): Env {
    if (this.customEnv) {
      return this.customEnv;
    }
    return {
      UBID_MAIN: process.env.UBID_MAIN || '',
      AT_MAIN: process.env.AT_MAIN || '',
      API_BASE: process.env.API_BASE || '',
      API_KEY: process.env.API_KEY || '',
      TZ: process.env.TZ || '',
      SPOTIFY_TOKEN: process.env.SPOTIFY_TOKEN || '',
      SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || '',
      SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || '',
      SPOTIFY_REFRESH_TOKEN: process.env.SPOTIFY_REFRESH_TOKEN || '',
    };
  }

  private registerTools() {
    // Announcements
    this.server.tool(
      'alexa_announce',
      'Send voice announcements to Alexa devices',
      AlexaAnnounceSchema.shape,
      (args) => announceAlexa(args, { env: this.getEnv() }),
    );

    // State Monitoring
    this.server.tool(
      'get_bedroom_state',
      'Get bedroom sensors (temp, light, motion) and lighting status',
      {},
      (args) => getBedroomState(args, { env: this.getEnv() }),
    );

    this.server.tool(
      'get_music_status',
      'Get current track and playback info from Alexa',
      {},
      (args) => getMusicStatus(args, { env: this.getEnv() }),
    );

    this.server.tool(
      'get_all_sensor_data',
      'List all available sensors and their basic capabilities',
      {},
      (args) => getAllSensorData(args, { env: this.getEnv() }),
    );

    // Device Control
    this.server.tool('list_lights', 'List discovered lights and their IDs', {}, (args) =>
      listLights(args, { env: this.getEnv() }),
    );
    this.server.tool('set_light_power', 'Turn light ON or OFF', SetLightPowerSchema.shape, (args) =>
      setLightPower(args, { env: this.getEnv() }),
    );
    this.server.tool(
      'set_light_brightness',
      'Set light brightness (0-100)',
      SetLightBrightnessSchema.shape,
      (args) => setLightBrightness(args, { env: this.getEnv() }),
    );
    this.server.tool(
      'set_light_color',
      'Set light color or temperature',
      SetLightColorSchema.shape,
      (args) => setLightColor(args, { env: this.getEnv() }),
    );

    this.server.tool('get_device_volumes', 'Show volume level for all devices', {}, (args) =>
      getAllDeviceVolumes(args, { env: this.getEnv() }),
    );
    this.server.tool(
      'set_device_volume',
      'Set absolute volume level (0-100)',
      SetVolumeSchema.shape,
      (args) => setVolume(args, { env: this.getEnv() }),
    );
    this.server.tool(
      'adjust_device_volume',
      'Adjust volume relatively (-100 to 100)',
      AdjustVolumeSchema.shape,
      (args) => adjustVolume(args, { env: this.getEnv() }),
    );

    this.server.tool('get_dnd_status', 'Get Do Not Disturb status', {}, (args) =>
      getDndStatus(args, { env: this.getEnv() }),
    );
    this.server.tool(
      'set_dnd_status',
      'Set Do Not Disturb status',
      SetDndStatusSchema.shape,
      (args) => setDndStatus(args, { env: this.getEnv() }),
    );

    // Discovery
    this.server.tool(
      'list_smarthome_devices',
      'Discover all devices and capabilities on the account',
      {},
      (args) => listSmartHomeDevices(args, { env: this.getEnv() }),
    );
  }

  /**
   * Returns the underlying McpServer instance.
   */
  getMcpServer(): McpServer {
    return this.server;
  }
}
