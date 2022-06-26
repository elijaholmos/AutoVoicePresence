/**
 * @name AutoVoicePresence
 * @version 1.1.0
 * @authorLink https://github.com/elijaholmos
 * @source https://raw.githubusercontent.com/elijaholmos/AutoVoicePresence/master/dist/AutoVoicePresence/AutoVoicePresence.plugin.js
 * @updateUrl https://raw.githubusercontent.com/elijaholmos/AutoVoicePresence/master/dist/AutoVoicePresence/AutoVoicePresence.plugin.js
 */
/*@cc_on
@if (@_jscript)
    
    // Offer to self-install for clueless users that try to run this directly.
    var shell = WScript.CreateObject("WScript.Shell");
    var fs = new ActiveXObject("Scripting.FileSystemObject");
    var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\\BetterDiscord\\plugins");
    var pathSelf = WScript.ScriptFullName;
    // Put the user at ease by addressing them in the first person
    shell.Popup("It looks like you've mistakenly tried to run me directly. \n(Don't do that!)", 0, "I'm a plugin for BetterDiscord", 0x30);
    if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
        shell.Popup("I'm in the correct folder already.", 0, "I'm already installed", 0x40);
    } else if (!fs.FolderExists(pathPlugins)) {
        shell.Popup("I can't find the BetterDiscord plugins folder.\nAre you sure it's even installed?", 0, "Can't install myself", 0x10);
    } else if (shell.Popup("Should I copy myself to BetterDiscord's plugins folder for you?", 0, "Do you need some help?", 0x34) === 6) {
        fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
        // Show the user where to put plugins in the future
        shell.Exec("explorer " + pathPlugins);
        shell.Popup("I'm installed!", 0, "Successfully installed", 0x40);
    }
    WScript.Quit();

@else@*/


module.exports = (() => {
    const config = {info:{name:"AutoVoicePresence",authors:[{name:"Ollog10",discord_id:"139120967208271872",github_username:"elijaholmos"}],version:"1.1.0",description:"Automatically updates your rich presence when your voice activity changes",github:"https://github.com/elijaholmos/AutoVoicePresence",github_raw:"https://raw.githubusercontent.com/elijaholmos/AutoVoicePresence/master/dist/AutoVoicePresence/AutoVoicePresence.plugin.js"},main:"index.js",changelog:[{title:"New Features",type:"added",items:["Rich presence for calls in individual DMs","Rich presence for calls in group DMs"]}]};

    return !global.ZeresPluginLibrary ? class {
        constructor() {this._config = config;}
        getName() {return config.info.name;}
        getAuthor() {return config.info.authors.map(a => a.name).join(", ");}
        getDescription() {return config.info.description;}
        getVersion() {return config.info.version;}
        load() {
            BdApi.showConfirmationModal("Library Missing", `The library plugin needed for ${config.info.name} is missing. Please click Download Now to install it.`, {
                confirmText: "Download Now",
                cancelText: "Cancel",
                onConfirm: () => {
                    require("request").get("https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js", async (error, response, body) => {
                        if (error) return require("electron").shell.openExternal("https://betterdiscord.net/ghdl?url=https://raw.githubusercontent.com/rauenzi/BDPluginLibrary/master/release/0PluginLibrary.plugin.js");
                        await new Promise(r => require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0PluginLibrary.plugin.js"), body, r));
                    });
                }
            });
        }
        start() {}
        stop() {}
    } : (([Plugin, Api]) => {
        const plugin = (Plugin, Library) => {
    const { DiscordModules, WebpackModules, Logger } = Library;
    
    const constants = (() => {return {
	DM: {
		id: '983527993202868235',
		name: 'in a call',
	},
	GROUP_DM: {
		id: '990414607384473640',
		name: 'in a group call',
	},
	GUILD_VOICE: {
		id: '988670308418478080',
		name: 'in a voice channel',
	},
	GUILD_STAGE_VOICE: {
		id: '988671978326073354',
		name: 'in a stage',
	},
};
})();

    const { SET_ACTIVITY } = WebpackModules.getByProps('SET_ACTIVITY');
    const VoiceStateStore = WebpackModules.getByProps('getVoiceStatesForChannel');

    VoiceStateStore.__proto__.getVoiceUserCount = function (
		channel_id = DiscordModules.SelectedChannelStore.getVoiceChannelId()
	) {
		return Object.keys(this.getVoiceStatesForChannel(channel_id)).length;
	};
    VoiceStateStore.__proto__.getVoiceUsers = function (
		channel_id = DiscordModules.SelectedChannelStore.getVoiceChannelId()
	) {
		return Object.keys(this.getVoiceStatesForChannel(channel_id)).map(
			DiscordModules.UserStore.getUser
		);
	};

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

    const resolveURI = function (uri) {
        return uri.startsWith('/') 
            ? `${location.protocol}${window.GLOBAL_ENV.ASSET_ENDPOINT}${uri}`
            : uri;
    };
    
    class RPC {
        static activity = {};
        static determineVoiceType() {
            const channel = DiscordModules.ChannelStore.getChannel(DiscordModules.SelectedChannelStore.getVoiceChannelId());
            return !channel?.type
                ? null
                : constants[DiscordModules.DiscordConstants.ChannelTypes[channel.type]];
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
                        //state: `${VoiceStateStore.getVoiceUserCount()} total users`,
                        assets: {
                            large_image: resolveURI(user.getAvatarURL(null, null, true)),
                            large_text: `${user.username}#${user.discriminator}`,
                        },
                    });
                    break;
                case DiscordModules.DiscordConstants.ChannelTypes.GROUP_DM:
                    const { id, name, recipients, icon } = channel;
                    RPC.setActivity({
                        timestamps: { start: Date.now() },
                        details: name,
                        state: `${VoiceStateStore.getVoiceUserCount()} of ${recipients.length+1} members in call`,
                        assets: {
                            //default image color doesn't match and it's an incredible pain to figure out why
                            large_image: !!icon
                                ? `${location.protocol}//${window.GLOBAL_ENV.CDN_HOST}/channel-icons/${id}/${icon}`
                                : resolveURI(DiscordModules.ImageResolver.getChannelIconURL(id)),
                            large_text: 
                                [...new Set([
                                    ...recipients,
                                    DiscordModules.UserStore.getCurrentUser().id,
                                ])].map(
                                    (uid) =>
                                        DiscordModules.UserStore.getUser(uid).username
                                ).join(', '),
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
                case DiscordModules.DiscordConstants.ChannelTypes.GUILD_VOICE:
                    const guild = DiscordModules.GuildStore.getGuild(channel.guild_id);
                    Logger.info(guild);
                    RPC.setActivity({
                        timestamps: { start: Date.now() },
                        details: channel.name,
                        state: `${VoiceStateStore.getVoiceUserCount()} total users`,
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
                //!= to coerce string/number if necessary
                const [voice_state] = e.voiceStates;
                if(!voice_state) return;

                //will both be null for GROUP_DM
                if(voice_state.guildId != target_channel.guild_id) return;

                //many non-relevant VOICE_STATE_UPDATES events pass thru... should be cleaned up in future
                
                let activity = {};
                switch (target_channel?.type) {
					//voice_state.channelId will be null if a user left channel
					case DiscordModules.DiscordConstants.ChannelTypes.GROUP_DM:
						activity = {
							state: `${VoiceStateStore.getVoiceUserCount(
								target_channel.id
							)} of ${
								target_channel.rawRecipients.length + 1
							} members in call`,
						};
                        break;
					case DiscordModules.DiscordConstants.ChannelTypes.GUILD_VOICE:
						//if(voice_state.guildId != target_channel.guild_id) return;
						activity = {
							state: `${VoiceStateStore.getVoiceUserCount(
								target_channel.id
							)} total users`,
						};
						break;
					default:
						Logger.info(`default: ${target_channel?.type}`);
						break;
				}

                RPC.updateActivity(activity);
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
        return plugin(Plugin, Api);
    })(global.ZeresPluginLibrary.buildPlugin(config));
})();
/*@end@*/