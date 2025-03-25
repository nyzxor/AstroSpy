// Coded by nyzxor and Claude/ChatGPT
// Thanks Audibert, for the idea that I simply improved (and took).
// https://github.com/nyzxor/AstroSpy

const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    EmbedBuilder 
} = require('discord.js');
const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    StreamType,
    EndBehaviorType,
    VoiceConnectionStatus,
    NoSubscriberBehavior
} = require('@discordjs/voice')
const prism = require('prism-media');
const { PassThrough, Transform } = require('stream');
const fs = require('fs');
const path = require('path');
const AudioMixer = require('audio-mixer');
const { RtpStream } = require('prism-media');
const { VoiceReceiver } = require('@discordjs/voice');
const WebSocket = require('ws');
require('dotenv').config();

// Polyfill para headers WAV (opcional)
const waveheader = require('waveheader'); // npm install waveheader

// Cliente principal (bot de moderação)
const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Cliente selfbot
const selfbot = new SelfbotClient({
    checkUpdate: false,
    patchVoice: true,
    ws: {
        properties: {
            browser: 'Discord Android',  // Ou 'Discord iOS'
            device: 'Samsung Galaxy',    // Ou 'iPhone'
            os: 'Android'               // Ou 'iOS'
        }
    }
});

// Controle de conexões ativas
const activeConnections = new Map();

function hex(hex) {
	if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
		throw new Error("Código hex inválido. Deve ser no formato #RRGGBB.");
	}

	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);

	if (
		isNaN(r) ||
		isNaN(g) ||
		isNaN(b) ||
		r < 0 ||
		r > 255 ||
		g < 0 ||
		g > 255 ||
		b < 0 ||
		b > 255
	) {
		throw new Error("Valores RGB fora do intervalo válido (0-255).");
	}

	return `\x1b[38;2;${r};${g};${b}m`;
}

const cor = hex("#008000");
const erro = hex("#ff0000");
const ativo = hex("#19e356");
const reset = hex("#ffffff");

async function titulo(username, userId, botname) {
    console.log(`
        ${cor} █████╗ ███████╗████████╗██████╗  ██████╗ ${reset}███████╗██████╗ ██╗   ██╗ 
        ${cor}██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗${reset}██╔════╝██╔══██╗╚██╗ ██╔╝
        ${cor}███████║███████╗   ██║   ██████╔╝██║   ██║${reset}███████╗██████╔╝ ╚████╔╝ 
        ${cor}██╔══██║╚════██║   ██║   ██╔══██╗██║   ██║${reset}╚════██║██╔═══╝   ╚██╔╝  
        ${cor}██║  ██║███████║   ██║   ██║  ██║╚██████╔╝${reset}███████║██║        ██║   
        ${cor}╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ${reset}╚══════╝╚═╝        ╚═╝   \n   
        ${cor}Usuário:${reset} ${username}
        ${cor}ID:${reset} ${userId}
        ${cor}Bot Mod:${reset} ${botname}\n`);
}
// Classe para gravação contínua
class WavRecorder {
    constructor() {
        this.recordings = new Map();
        this.baseDir = './recordings';
        this.silenceBuffer = Buffer.alloc(3840, 0); // Buffer de silêncio para gaps
        
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir);
        }
    }

    startRecording(userId, channelId) {
        // Se já existe uma gravação, retorna ela
        if (this.recordings.has(userId)) {
            return this.recordings.get(userId);
        }

        const filename = `${this.baseDir}/${channelId}_${userId}_${Date.now()}.wav`;
        const fileStream = fs.createWriteStream(filename);
        
        // Header WAV inicial
        const header = Buffer.alloc(44);
        header.write('RIFF', 0);
        header.writeUInt32LE(0, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(2, 22);
        header.writeUInt32LE(48000, 24);
        header.writeUInt32LE(48000 * 2 * 2, 28);
        header.writeUInt16LE(4, 32);
        header.writeUInt16LE(16, 34);
        header.write('data', 36);
        header.writeUInt32LE(0, 40);
        
        fileStream.write(header);

        const recording = {
            filename,
            stream: fileStream,
            bytesWritten: 0,
            startTime: Date.now(),
            lastChunkTime: Date.now(),
            silence: false
        };

        this.recordings.set(userId, recording);
        console.log(`[WAV] Iniciando gravação para ${userId} em ${filename}`);
        
        return recording;
    }

    writeChunk(userId, chunk) {
        const recording = this.recordings.get(userId);
        if (!recording || !recording.stream) return;

        const now = Date.now();
        const timeSinceLastChunk = now - recording.lastChunkTime;

        // Se passou muito tempo desde o último chunk, adiciona silêncio
        if (timeSinceLastChunk > 200 && !recording.silence) { // 200ms de tolerância
            recording.stream.write(this.silenceBuffer);
            recording.bytesWritten += this.silenceBuffer.length;
            recording.silence = true;
        }

        recording.stream.write(chunk);
        recording.bytesWritten += chunk.length;
        recording.lastChunkTime = now;
        recording.silence = false;
    }

    finalizeWav(userId) {
        const recording = this.recordings.get(userId);
        if (!recording) return;

        try {
            const { filename, stream, bytesWritten } = recording;
            
            // Fechar stream
            stream.end();
            
            // Atualizar headers WAV
            const fd = fs.openSync(filename, 'r+');
            
            // Tamanho total do arquivo
            const fileSize = bytesWritten + 36;
            const sizeBuf = Buffer.alloc(4);
            sizeBuf.writeUInt32LE(fileSize, 0);
            fs.writeSync(fd, sizeBuf, 0, 4, 4);
            
            // Tamanho dos dados
            sizeBuf.writeUInt32LE(bytesWritten, 0);
            fs.writeSync(fd, sizeBuf, 0, 4, 40);
            
            fs.closeSync(fd);
            
            const duration = (Date.now() - recording.startTime) / 1000;
            console.log(`[WAV] Gravação finalizada para ${userId}: ${(bytesWritten/1024/1024).toFixed(2)}MB, ${duration.toFixed(2)}s`);
            
            this.recordings.delete(userId);
            
        } catch (error) {
            console.error(`[WAV] Erro ao finalizar gravação para ${userId}:`, error);
        }
    }

    finalizeAll() {
        console.log('[WAV] Finalizando todas as gravações...');
        for (const userId of this.recordings.keys()) {
            this.finalizeWav(userId);
        }
    }
}

// Classe para gerenciar mixagem de áudio
class AudioStreamManager {
    constructor() {
        this.userStreams = new Map();
        this.mixer = new AudioMixer.Mixer({
            channels: 2,
            bitDepth: 16,
            sampleRate: 48000
        });
    }

    createUserStream(userId) {
        if (this.userStreams.has(userId)) return;

        // Cria um decoder OPUS para cada usuário
        const decoder = new prism.opus.Decoder({
            rate: 48000,
            channels: 2,
            frameSize: 960
        });

        // Stream de gravação individual
        const recordingStream = new PassThrough();
        
        // Stream para mixagem global
        const mixerInput = this.mixer.input({
            channels: 2,
            volume: 100
        });

        // Conexão dos pipes
        decoder.pipe(mixerInput);
        decoder.pipe(recordingStream);

        this.userStreams.set(userId, {
            decoder,
            recordingStream,
            mixerInput
        });

        return decoder;
    }

    getRecordingStream(userId) {
        return this.userStreams.get(userId)?.recordingStream;
    }

    destroyUserStream(userId) {
        const streams = this.userStreams.get(userId);
        if (streams) {
            streams.decoder.destroy();
            streams.recordingStream.destroy();
            streams.mixerInput.destroy();
            this.userStreams.delete(userId);
        }
    }

    getMixedStream() {
        return this.mixer;
    }
}
// Comandos
const commands = [
    new SlashCommandBuilder()
        .setName('spy')
        .setDescription('Inicia monitoramento de um canal de voz')
        .addStringOption(option =>
            option.setName('channelid')
                .setDescription('ID do canal a ser monitorado')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('record')
                .setDescription('Gravar áudio?')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('stopspy')
        .setDescription('Para o monitoramento de um canal')
        .addStringOption(option =>
            option.setName('channelid')
                .setDescription('ID do canal a parar monitoramento')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Mostra status do monitoramento')
];


// Função auxiliar para criar arquivo WAV
function createWavWriter(userId) {
    const filename = `./recordings/${userId}_${Date.now()}.wav`;
    const fileStream = fs.createWriteStream(filename);
    
    // Header WAV inicial
    const header = Buffer.alloc(44);
    
    // RIFF chunk descriptor
    header.write('RIFF', 0);
    header.writeUInt32LE(0, 4); // Placeholder para tamanho
    header.write('WAVE', 8);
    
    // Subchunk 1 (fmt)
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size
    header.writeUInt16LE(1, 20); // AudioFormat (PCM)
    header.writeUInt16LE(2, 22); // NumChannels
    header.writeUInt32LE(48000, 24); // SampleRate
    header.writeUInt32LE(48000 * 2 * 2, 28); // ByteRate
    header.writeUInt16LE(4, 32); // BlockAlign
    header.writeUInt16LE(16, 34); // BitsPerSample
    
    // Subchunk 2 (data)
    header.write('data', 36);
    header.writeUInt32LE(0, 40); // Placeholder para tamanho dos dados
    
    fileStream.write(header);
    
    console.log('[WAV] Arquivo criado:', filename);
    
    return {
        stream: fileStream,
        filename,
        bytesWritten: 0
    };
}

// Configuração do receiver com suporte a RTP
function createEnhancedReceiver(connection) {
    const receiver = connection.receiver;
    
    // Adicionar suporte a RTP ao receiver
    receiver.createStream = function(userId, options) {
        const ssrc = this.subscriptions.get(userId)?.connection?.ssrc;
        if (!ssrc) {
            throw new Error('SSRC não encontrado');
        }

        return this.subscribe(userId, {
            ...options,
            rtcp: {
                port: this.port,
                ssrc: ssrc
            }
        });
    };

    return receiver;
}


// Função principal pra funcionar (não ta nada clean).
async function setupVoiceSpy(targetChannelId, modChannelId, shouldRecord = false) {
    if (activeConnections.has(targetChannelId)) {
        throw new Error('Este canal já está sendo monitorado');
    }

    console.log('[DEBUG] Iniciando setup para canal:', targetChannelId);
    
    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
            maxMissedFrames: 5000
        }
    });
    
    try {
        const targetChannel = await selfbot.channels.fetch(targetChannelId);
        console.log('[DEBUG] Canal encontrado:', targetChannel.name);
        console.log('[DEBUG] Membros no canal:', targetChannel.members.size);

        // Criar conexão com canal de moderação
        console.log('[DEBUG] Conectando ao canal de moderação:', modChannelId);
        const modChannel = await bot.channels.fetch(modChannelId);
        const modConnection = joinVoiceChannel({
            channelId: modChannel.id,
            guildId: modChannel.guild.id,
            adapterCreator: modChannel.guild.voiceAdapterCreator,
            selfDeaf: false
        });

        // Conexão fonte
        console.log('[DEBUG] Iniciando conexão fonte');
        const voiceConnection = await selfbot.voice.joinChannel(targetChannel, {
            selfDeaf: false,
            selfMute: true
        });

        console.log('[DEBUG] Aguardando conexão fonte estabilizar...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Debug de membros
        targetChannel.members.forEach(member => {
            console.log('[DEBUG] Membro no canal:', member.user.tag);
        });

        // Configurar receptor de áudio
        console.log('[DEBUG] Configurando receptor de áudio');
        const receiver = voiceConnection.receiver;
            // Criar mapa de gravações
        const activeRecordings = new Map();
        const wavRecorder = shouldRecord ? new WavRecorder() : null;

        voiceConnection.on('speaking', (user, speaking) => {
            console.log('[VOICE] Speaking event:', user.tag, speaking);
            
            if (speaking) {
                try {
                    console.log('[AUDIO] Criando stream para:', user.tag);
                    
                    const audioStream = receiver.createStream(user, {
                        mode: 'pcm',
                        end: 'manual'
                    });
    
                    audioStream.setMaxListeners(20);
    
                    if (shouldRecord) {
                        try {
                            console.log('[RECORD] Iniciando gravação para:', user.tag);
                            // Iniciar gravação WAV
                            const recording = wavRecorder.startRecording(user.id, targetChannelId);
                            audioStream.on('data', chunk => {
                                wavRecorder.writeChunk(user.id, chunk);
                            });

                            console.log('[RECORD] Gravação configurada para:', user.tag);
                        } catch (error) {
                            console.error('[RECORD] Erro ao configurar gravação:', error);
                        }
                    }

                    // Criar encoder Opus para transmissão
                    const opusEncoder = new prism.opus.Encoder({
                        rate: 48000,
                        channels: 2,
                        frameSize: 960,
                        encoderApplication: 2048
                    });

                    // Pipeline para transmissão
                    audioStream.pipe(opusEncoder);

                    // Debug
                    audioStream.on('data', (chunk) => {
                        console.log('[AUDIO] PCM recebido de', user.tag, ':', chunk.length, 'bytes');
                    });

                    opusEncoder.on('data', (chunk) => {
                        console.log('[AUDIO] Opus encoded:', chunk.length, 'bytes');
                    });
    
                    const resource = createAudioResource(opusEncoder, {
                        inputType: StreamType.Opus,
                        inlineVolume: true
                    });
    
                    resource.volume?.setVolume(1);
                    player.play(resource);
    
                } catch (error) {
                    console.error('[ERROR] Erro ao processar áudio para', user.tag, ':', error);
                }
            } else {
                // Cleanup quando usuário para de falar
                if (activeRecordings.has(user.id)) {
                    const recording = activeRecordings.get(user.id);
                    if (recording.writer) {
                        recording.writer.stream.end();
                    }
                    if (recording.stream) {
                        recording.stream.destroy();
                    }
                    activeRecordings.delete(user.id);
                }
            }
        });
    

        // Debug do player
        player.on('stateChange', (oldState, newState) => {
            console.log('[PLAYER] Estado:', oldState.status, '->', newState.status);
        });

        player.on('error', error => {
            console.error('[PLAYER] Erro:', error);
        });

        // Conectar player ao canal de mod
        modConnection.subscribe(player);

        // Armazenar referências
        // Armazenar no activeConnections
        activeConnections.set(targetChannelId, {
            source: voiceConnection,
            mod: modConnection,
            player,
            wavRecorder,
            startTime: Date.now()
        });
        console.log('[DEBUG] Setup concluído com sucesso');
        return true;

    } catch (error) {
        console.error('[SETUP ERROR]', error);
        await stopSpy(targetChannelId);
        throw error;
    }
}
async function stopSpy(targetChannelId) {
    const connection = activeConnections.get(targetChannelId);
    if (connection) {
        console.log('[DEBUG] Parando monitoramento para canal:', targetChannelId);

        try {
            // Finalizar gravações WAV
            if (connection.wavRecorder) {
                connection.wavRecorder.finalizeAll();
            }

            // Finalizar gravações
            if (connection.recordings && connection.recordings.size > 0) {
                console.log('[RECORD] Finalizando gravações...');
                for (const [userId, recording] of connection.recordings) {
                    try {
                        // Finalizar stream WAV
                        const wavWriter = recording.writer;
                        if (wavWriter && wavWriter.stream) {
                            // Atualizar headers WAV
                            const dataSize = wavWriter.bytesWritten;
                            const fileSize = dataSize + 36;
                            
                            const fd = fs.openSync(wavWriter.filename, 'r+');
                            // Escrever tamanho total
                            const sizeBuf = Buffer.alloc(4);
                            sizeBuf.writeUInt32LE(fileSize, 0);
                            fs.writeSync(fd, sizeBuf, 0, 4, 4);
                            
                            // Escrever tamanho dos dados
                            sizeBuf.writeUInt32LE(dataSize, 0);
                            fs.writeSync(fd, sizeBuf, 0, 4, 40);
                            
                            fs.closeSync(fd);
                            
                            // Fechar streams
                            wavWriter.stream.end();
                            console.log('[RECORD] Gravação finalizada para:', userId);
                        }

                        // Limpar outros recursos
                        if (recording.decoder) recording.decoder.destroy();
                        if (recording.stream) recording.stream.destroy();
                        
                    } catch (err) {
                        console.error('[RECORD] Erro ao finalizar gravação:', err);
                    }
                }
            }

            // Parar player
            if (connection.player) {
                connection.player.stop();
                console.log('[DEBUG] Player parado');
            }

            // Desconectar fonte
            if (connection.source) {
                await connection.source.disconnect();
                console.log('[DEBUG] Fonte desconectada');
            }

            // Destruir conexão mod
            if (connection.mod) {
                connection.mod.destroy();
                console.log('[DEBUG] Conexão mod destruída');
            }

            activeConnections.delete(targetChannelId);
            console.log('[DEBUG] Monitoramento finalizado para canal:', targetChannelId);
            return true;

        } catch (error) {
            console.error('[ERROR] Erro ao parar monitoramento:', error);
            activeConnections.delete(targetChannelId);
            throw error;
        }
    }
    return false;
}
// Handler de comandos
bot.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    try {
        // Verificar permissões
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            await interaction.reply({
                content: 'Você não tem permissão para usar este comando',
                ephemeral: true
            });
            return;
        }

        switch (commandName) {
            case 'spy': {
                await interaction.deferReply({ ephemeral: true });
                const targetChannelId = interaction.options.getString('channelid');
                const shouldRecord = interaction.options.getBoolean('record') || false;
                const modChannelId = process.env.MOD_CHANNEL_ID;

                await setupVoiceSpy(targetChannelId, modChannelId, shouldRecord);
                
                const embed = new EmbedBuilder()
                    .setTitle('Monitoramento Iniciado')
                    .setDescription(`Canal: <#${targetChannelId}>`)
                    .setColor('#00FF00')
                    .addFields(
                        { name: 'Gravação', value: shouldRecord ? 'Ativada (Individual)' : 'Desativada' },
                        { name: 'Transmissão', value: 'Mixada (Todos os usuários)' },
                        { name: 'Iniciado por', value: interaction.user.tag }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed], ephemeral: true });
                break;
            }
            case 'stopspy': {
                const targetChannelId = interaction.options.getString('channelid');
                const success = await stopSpy(targetChannelId);
                
                await interaction.reply({
                    content: success ? 'Monitoramento finalizado com sucesso' : 'Canal não estava sendo monitorado',
                    ephemeral: true
                });
                break;
            }
            case 'status': {
                const embed = new EmbedBuilder()
                    .setTitle('Status do Sistema')
                    .setColor('#0099FF');

                if (activeConnections.size > 0) {
                    const fields = Array.from(activeConnections.entries()).map(([channelId, connection]) => ({
                        name: `Canal: <#${channelId}>`,
                        value: `
                            Iniciado: ${new Date(connection.startTime).toLocaleString()}
                            Gravação: ${connection.recordings.size > 0 ? 'Ativa' : 'Inativa'}
                            Usuários gravando: ${connection.recordings.size}
                        `.trim(),
                        inline: false
                    }));
                    embed.addFields(fields);
                } else {
                    embed.setDescription('Nenhum canal sendo monitorado no momento');
                }

                embed.setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
                break;
            }
        }
    } catch (error) {
        console.error('Erro:', error);
        await interaction.reply({
            content: `Erro: ${error.message}`,
            ephemeral: true
        }).catch(() => {
            interaction.editReply({
                content: `Erro: ${error.message}`,
                ephemeral: true
            });
        });
    }
});

// Tratamento de erros de conexão para self e bot
selfbot.on('error', error => {
    console.error('Erro no selfbot:', error);
});

bot.on('error', error => {
    console.error('Erro no bot:', error);
});

// Handler para desconexões inesperadas
function handleDisconnect(connection, channelId) {
    console.log(`Desconexão detectada no canal ${channelId}`);
    stopSpy(channelId).catch(console.error);
}

let selfbotReady = false;
let botReady = false;

selfbot.once('ready', () => {
    console.log(`Selfbot conectado como ${selfbot.user.tag}`);
    selfbotReady = true;
    checkBothReady();
});


bot.once('ready', async () => {
    console.log(`Bot de moderação online como ${bot.user.tag}`);
    botReady = true;
    checkBothReady();
    
    try {
        await bot.application.commands.set(commands);
        console.log('Comandos registrados');

        const recordingsPath = path.join(__dirname, 'recordings');
        if (!fs.existsSync(recordingsPath)) {
            fs.mkdirSync(recordingsPath);
            console.log('Pasta de gravações criada');
        }
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
});

function checkBothReady() {
    if (selfbotReady && botReady) {
        titulo(selfbot.user.tag, selfbot.user.id, bot.user.tag);
    }
}

// Iniciar conexões
async function startBot() {
    try {
        // Primeiro conecta o selfbot
        await selfbot.login(process.env.SELFBOT_TOKEN);
        // Depois conecta o bot
        await bot.login(process.env.BOTASTRO_TOKEN);
    } catch (error) {
        console.error('Erro ao iniciar os clientes:', error);
        process.exit(1);
    }
}
// Tratamento de erros não capturados
process.on('unhandledRejection', error => {
    console.error('Erro não tratado:', error);
});

process.on('uncaughtException', error => {
    console.error('Exceção não capturada:', error);
});

// Limpar conexões ao encerrar
process.on('SIGINT', async () => {
    console.log('Encerrando conexões...');
    
    for (const [channelId, connection] of activeConnections) {
        if (connection.wavRecorder) {
            connection.wavRecorder.finalizeAll();
        }
        await stopSpy(channelId);
    }
    
    process.exit(0);
});


startBot();