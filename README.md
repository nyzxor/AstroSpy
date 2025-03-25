# AstroSpy Documentation

## Overview

AstroSpy is a specialized Discord moderation tool designed for server administrators to monitor voice channels. It functions through a dual-client system: a primary bot for administrative commands and a selfbot that joins target voice channels. This architecture allows moderators to listen to conversations in voice channels without being visibly present.

## Features

- **Voice Channel Monitoring**: Listen to conversations in target voice channels remotely
- **Audio Recording**: Optional feature to record user audio for later review
- **Individual User Tracking**: Identify which users are speaking
- **Command-Based Control**: Simple slash commands for operation
- **Status Reporting**: Check active monitoring sessions

## Requirements

- Node.js
- NPM
- Discord Bot Token
- Discord User Token (selfbot)
- Voice channel for monitoring output

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/nyzxor/AstroSpy
   cd AstroSpy
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   BOTASTRO_TOKEN=your_bot_token_here
   SELFBOT_TOKEN=your_user_token_here
   MOD_CHANNEL_ID=channel_id_for_moderators
   ```

4. Start the bot:
   ```
   node index.js
   ```

## Environment Setup

### Bot Token
The primary bot requires a standard Discord bot token with the following permissions:
- Send Messages
- Manage Messages
- Connect to Voice
- Speak in Voice
- View Channels

### Selfbot Token
**IMPORTANT DISCLAIMER**: Using selfbots (user account automation) is against Discord's Terms of Service. This tool is provided for educational purposes only. Using it may result in account termination.

To obtain a user token (at your own risk):
1. Open Discord in your browser
2. Press F12 to open developer tools
3. Navigate to the "Network" tab
4. Send a message in any channel
5. Look for a request with the name similar to "messages"
6. Find the "authorization" header in the request
7. This value is your user token

### Moderator Channel
Create a private voice channel accessible only to moderators where the audio feed will be transmitted.

## Commands

### /spy
Initiates monitoring of a target voice channel.

**Usage:**
```
/spy channelid:123456789012345678 record:true
```

**Parameters:**
- `channelid`: The ID of the voice channel to monitor (required)
- `record`: Whether to record audio (optional, defaults to false)

### /stopspy
Stops monitoring a specific channel.

**Usage:**
```
/stopspy channelid:123456789012345678
```

**Parameters:**
- `channelid`: The ID of the voice channel to stop monitoring (required)

### /status
Displays information about all active monitoring sessions.

**Usage:**
```
/status
```

## How It Works

1. The primary bot connects to the moderator voice channel
2. The selfbot joins the target voice channel
3. Audio from the target channel is captured, processed, and relayed to the moderator channel
4. If recording is enabled, audio is saved as WAV files in the `/recordings` directory

## Technical Architecture

### Components

1. **Bot Client**: Handles commands and connects to the moderator channel
2. **Selfbot Client**: Joins target channels and captures audio
3. **Voice Connection**: Manages voice data transmission
4. **Audio Processing**: Handles encoding/decoding and mixing of audio streams
5. **WAV Recorder**: Manages audio recording to disk

### Audio Flow

```
Target Users → Selfbot (Receiver) → Audio Processing → Bot Client → Moderator Channel
                       ↓
                 WAV Recording
                 (if enabled)
```

## Security Considerations

- All commands are restricted to administrators only
- Commands respond with ephemeral messages (only visible to the command issuer)
- Audio recording files should be secured appropriately
- The system logs connection events and errors for auditing purposes

## Troubleshooting

### Common Issues

1. **Bot doesn't respond to commands**
   - Ensure the bot has proper permissions
   - Check if commands are registered correctly
   - Verify the bot has administrator access

2. **No audio transmission**
   - Check if both bots are in their respective channels
   - Verify voice permissions in both channels
   - Ensure the selfbot is not muted or deafened
   - Check for any firewall issues blocking UDP traffic

3. **Recording not working**
   - Verify the `/recordings` directory exists and is writable
   - Check console for any file system errors
   - Ensure sufficient disk space is available

### Debug Mode

For advanced troubleshooting, the system outputs detailed logs about connection status, voice events, and error conditions.

## Legal and Ethical Guidelines

This tool should only be used:
- On servers you own or have explicit permission to moderate
- With clear disclosure to users that monitoring may occur
- In compliance with local laws regarding audio recording and privacy
- For legitimate moderation purposes only

Remember that Discord's Terms of Service prohibit selfbots. Use of this tool may result in account termination.

## Future Improvements

- Web interface for management
- More robust error handling
- Multiple simultaneous channel monitoring
- Audio transcription capabilities
- Enhanced logging and reporting

## Credits

- Originally designed by nyzxor
- Based on an idea by Audibert
- Built with Discord.js and @discordjs/voice libraries

## License

MIT License - See LICENSE file for details

---

*This documentation is provided for educational purposes only. The authors are not responsible for misuse of this software or for violations of Discord's Terms of Service.*
