module.exports = (Plugin, Library) => {
    const { DiscordModules, WebpackModules, Logger } = Library;
    
    const constants = require('constants.js');

    const { SET_ACTIVITY } = WebpackModules.getByProps('SET_ACTIVITY');
    const VoiceStateStore = WebpackModules.getByProps('getVoiceStatesForChannel');

    DiscordModules.Dispatcher.__proto__.customUnsubscribe = function (event, method) {
        if(!method) throw 'You need a method name to use customUnsubscribe';

        const set = this._subscriptions[event];
        if(!set) return;

        const parseMethodName = (n) => {
            n = n.trim();
            n.startsWith('function ') && (n = n.substring('function '.length).trim());
            n.startsWith('bound ') && (n = n.substring('bound '.length).trim());
            return n;
        };
        
        set.forEach((item) => parseMethodName(item.name).startsWith(method.name) && set.delete(item));
        set.size === 0 && delete this._subscriptions[event];
    };

    const AssetResolver = WebpackModules.getByProps('getAssetIds');
    //need to override the method because some bug occurs where it resends the external asset id as a URL, causing null to be returned
    //catch rejected promises?
    !AssetResolver?._getAssetIds && (AssetResolver._getAssetIds = AssetResolver.getAssetIds);   //only store original if it hasn't yet been overridden
    AssetResolver.getAssetIds = async function (app_id, urls, n) {
        return Promise.all(
			urls.map(async (url) =>
				url?.startsWith('mp:external/')
					? url
					: (await AssetResolver._getAssetIds(app_id, [url], n))[0]
			)
		);
    };
    
    class RPC {
        static activity = {};
        static determineVoiceType() {
            const channel = DiscordModules.ChannelStore.getChannel(DiscordModules.SelectedChannelStore.getVoiceChannelId());
            let res;
            switch(channel?.type) {
                case DiscordModules.DiscordConstants.ChannelTypes.DM:
                case DiscordModules.DiscordConstants.ChannelTypes.GROUP_DM:
                    res = constants.IN_A_CALL;
                    break;
                case DiscordModules.DiscordConstants.ChannelTypes.GUILD_VOICE:
                    res = constants.IN_A_VOICE_CHANNEL;
                    break;
                case DiscordModules.DiscordConstants.ChannelTypes.GUILD_STAGE_VOICE:
                    res = constants.IN_A_STAGE;
                    break;
                default:
                    res = constants.IN_A_CALL;
                    break;
            }
            return res;
        }
        
        //check if arrow function is supported
        static handlerObj = (activity) => ({
            isSocketConnected: () => true,
            socket: {
                id: 100,
                application: this.determineVoiceType(), //if null, this will still clear AutoVoicePresence
                transport: 'ipc',
            },
            args: {
                pid: 10,
                activity,
            },
        });

        static setActivity(activity) {
            console.log('incoming activity:', JSON.stringify(activity));
            this.activity = activity;
            SET_ACTIVITY.handler(this.handlerObj(activity)).catch(console.error);
        }

        // Update current activity, replacing only the new props
        static updateActivity(new_activity) {
            this.activity = {...this.activity, ...new_activity};
            SET_ACTIVITY.handler(this.handlerObj(this.activity)).catch(console.error);
        }

        static clearActivity() {
            this.activity = {};
            SET_ACTIVITY.handler(this.handlerObj(undefined)).catch(console.error);
        }
    }

    return class AutoVoicePresence extends Plugin {
        onStart() {
            //do some check if user is currently in VC when starting plugin
            RPC.clearActivity();
            //DiscordModules.Dispatcher.subscribe('VOICE_STATE_UPDATES', this.originalVoiceStateUpdateHandler);
            DiscordModules.Dispatcher.subscribe('VOICE_CHANNEL_SELECT', this.voiceChannelSelectHandler.bind(this));
        }

        onStop() {
            RPC.clearActivity();
            DiscordModules.Dispatcher.customUnsubscribe('VOICE_CHANNEL_SELECT', this.voiceChannelSelectHandler);
        }

        voiceChannelSelectHandler(e) {
            Logger.info('Voice Channel Selected');
            Logger.info(e);
            const channel = DiscordModules.ChannelStore.getChannel(DiscordModules.SelectedChannelStore.getVoiceChannelId());
            Logger.info(channel);
            if(!channel) {
                console.log('unsubscribing', this.detectUserCountChange());
                DiscordModules.Dispatcher.customUnsubscribe('VOICE_STATE_UPDATES', this.detectUserCountChange()); //remove event listener
                RPC.clearActivity();   //current user is not in voice channel
                return;
            }

            //const self=this;
            Logger.info('self1')
            console.log(this)
            console.log(this.detectUserCountChange())
            let activity;
            switch(channel?.type) {
                case DiscordModules.DiscordConstants.ChannelTypes.DM:
                case DiscordModules.DiscordConstants.ChannelTypes.GROUP_DM:
                    
                    break;
                case DiscordModules.DiscordConstants.ChannelTypes.GUILD_VOICE:
                    const guild = DiscordModules.GuildStore.getGuild(channel.guild_id);
                    Logger.info(guild);
                    Logger.info('this');
                    Logger.info(this);
                    RPC.setActivity({
                        timestamps: { start: Date.now() },
                        details: channel.name,
                        state: `${Object.keys(VoiceStateStore.getVoiceStatesForChannel(channel.id)).length} total users`,
                        assets: {
                            large_image: `${guild.getIconURL(null, true)}`,
                            large_text: guild.name,
                        },
                    });
                    console.log('subscribing', this.detectUserCountChange(channel));
                    DiscordModules.Dispatcher.subscribe('VOICE_STATE_UPDATES', this.detectUserCountChange(channel)); //create event listener
                    break;
                case DiscordModules.DiscordConstants.ChannelTypes.GUILD_STAGE_VOICE:
                    
                    break;
                default:
                    Logger.info(`default: ${channel?.type}`);
                    break;
            }
        }

        detectUserCountChange(target_channel) {
            return function handleState(e) {
                const [voice_state] = e.voiceStates;
                //!= to coerce string/number if necessary
                if(voice_state.guildId != target_channel.guild_id) return;
                //voice_state.channelId can be null if a user left
                //if(voice_state.channelId != target_channel.id) return;

                RPC.updateActivity({
                    state: `${Object.keys(VoiceStateStore.getVoiceStatesForChannel(target_channel.id)).length} total users`
                });
            };
        }

        voiceStateUpdateHandler(target_channel) {
            return function (e) {
                const [voice_state] = e.voiceStates;
                //!= to coerce string/number if necessary
                if(voice_state.channelId != target_channel.id) return;
            };
        }

        originalVoiceStateUpdateHandler(e) {
            const [voice_state] = e.voiceStates;
            //!= to coerce string/number if necessary
            if(voice_state.userId != DiscordModules.UserInfoStore.getId()) return;

            const channel = DiscordModules.ChannelStore.getChannel(VoiceStateStore.getCurrentClientVoiceChannelId());
            if(!channel) RPC.clearActivity();   //current user is not in voice channel

            switch(channel?.type) {
                case DiscordModules.DiscordConstants.ChannelTypes.DM:
                case DiscordModules.DiscordConstants.ChannelTypes.GROUP_DM:
                    res = constants.IN_A_CALL;
                    break;
                case DiscordModules.DiscordConstants.ChannelTypes.GUILD_VOICE:
                    res = constants.IN_A_VOICE_CHANNEL;
                    break;
                case DiscordModules.DiscordConstants.ChannelTypes.GUILD_STAGE_VOICE:
                    res = constants.IN_A_STAGE;
                    break;
                default:
                    res = constants.IN_A_CALL;
                    break;
            }
        }
    };
};
