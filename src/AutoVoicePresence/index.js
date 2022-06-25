module.exports = (Plugin, Library) => {
    const { DiscordModules, WebpackModules, Logger } = Library;
    
    const constants = require('constants.js');

    const { SET_ACTIVITY } = WebpackModules.getByProps('SET_ACTIVITY');
    const VoiceStateStore = WebpackModules.getByProps('getVoiceStatesForChannel');

    DiscordModules.Dispatcher.__proto__._subscriptionMap = new Map();
    DiscordModules.Dispatcher.__proto__.$subscribe = function (event, method) {
        const id = Date.now();
        this._subscriptionMap.set(id, [event, method]);
        this.subscribe(event, method);
        return id;
    };
    DiscordModules.Dispatcher.__proto__.$unsubscribe = function (id) {
        if(!id || !this._subscriptionMap.has(id)) return false;
        const [event, method] = this._subscriptionMap.get(id);
        this.unsubscribe(event, method);
        return this._subscriptionMap.delete(id);
    };
    DiscordModules.Dispatcher.__proto__.$unsubscribeAll = function (event) {
        this._subscriptionMap.forEach(([e, m], id) => {
            if(e !== event) return;
            this.unsubscribe(e, m);
            this._subscriptionMap.delete(id);
        });
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
        subscriptions = new Map();
        
        onStart() {
            //do some check if user is currently in VC when starting plugin
            RPC.clearActivity();
            DiscordModules.Dispatcher.$subscribe('VOICE_CHANNEL_SELECT', this.voiceChannelSelectHandler.bind(this));
        }

        onStop() {
            RPC.clearActivity();
            DiscordModules.Dispatcher.$unsubscribeAll('VOICE_CHANNEL_SELECT');
        }

        voiceChannelSelectHandler({currentVoiceChannelId=null} = {}) {
            Logger.info('Voice Channel Selected');
            const channel = DiscordModules.ChannelStore.getChannel(DiscordModules.SelectedChannelStore.getVoiceChannelId());
            Logger.info(channel);
            //user voice state is inactive
            if(!channel) {
                console.log('unsubscribing', this.detectUserCountChange());
                DiscordModules.Dispatcher.$unsubscribe(this.subscriptions.get('detectUserCountChange')); //remove event listener
                RPC.clearActivity();   //current user is not in voice channel
                return;
            }
            
            currentVoiceChannelId ??= channel.id;
            //user switched voice channels
            if(currentVoiceChannelId !== channel.id) 
                DiscordModules.Dispatcher.$unsubscribe(this.subscriptions.get('detectUserCountChange')); //remove event listener
               
            let activity;
            switch(channel?.type) {
                case DiscordModules.DiscordConstants.ChannelTypes.DM:
                    const user = DiscordModules.UserStore.getUser(channel.recipients[0]);
                    RPC.setActivity({
                        timestamps: { start: Date.now() },
                        details: `with ${user.username}`,
                        //state: `${Object.keys(VoiceStateStore.getVoiceStatesForChannel(channel.id)).length} total users`,
                        assets: {
                            large_image: user.getAvatarURL(null, null, true),
                            large_text: `${user.username}#${user.discriminator}`,
                        },
                    });
                    break;
                case DiscordModules.DiscordConstants.ChannelTypes.GROUP_DM:
                    //I'm thinking do something separate with group dm images and "playing..." name
                    break;
                case DiscordModules.DiscordConstants.ChannelTypes.GUILD_VOICE:
                    const guild = DiscordModules.GuildStore.getGuild(channel.guild_id);
                    Logger.info(guild);
                    RPC.setActivity({
                        timestamps: { start: Date.now() },
                        details: channel.name,
                        state: `${Object.keys(VoiceStateStore.getVoiceStatesForChannel(channel.id)).length} total users`,
                        assets: {
                            large_image: guild.getIconURL(null, true),
                            large_text: guild.name,
                        },
                    });
                    console.log('subscribing', this.detectUserCountChange(channel));
                    //create subscription
                    this.subscriptions.set(
						'detectUserCountChange',
						DiscordModules.Dispatcher.$subscribe(
							'VOICE_STATE_UPDATES',
							this.detectUserCountChange(channel)
						)
					);
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
    };
};
