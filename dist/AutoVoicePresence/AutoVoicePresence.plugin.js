/**
 * @name AutoVoicePresence
 * @version 1.0.0
 * @authorLink https://github.com/elijaholmos
 * @source https://raw.githubusercontent.com/elijaholmos/AutoVoicePresence/master/AutoVoicePresence.plugin.js
 * @updateUrl https://raw.githubusercontent.com/elijaholmos/AutoVoicePresence/master/AutoVoicePresence.plugin.js
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
    const config = {info:{name:"AutoVoicePresence",authors:[{name:"Ollog10",discord_id:"139120967208271872",github_username:"elijaholmos"}],version:"1.0.0",description:"Automatically updates your rich presence when your voice activity changes",github:"https://github.com/elijaholmos/AutoVoicePresence",github_raw:"https://raw.githubusercontent.com/elijaholmos/AutoVoicePresence/master/AutoVoicePresence.plugin.js"},main:"index.js"};

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
    IN_A_CALL: {
        id: '983527993202868235',
        name: 'in a call',
    },
    IN_A_VOICE_CHANNEL: {
        id: '988670308418478080',
        name: 'in a voice channel',
    },
    IN_A_LIVESTREAM: {
        id: '988671867986513950',
        name: 'in a livestream',
    },
    IN_A_STAGE: {
        id: '988671978326073354',
        name: 'in a stage',
    },
};
})();

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
        return plugin(Plugin, Api);
    })(global.ZeresPluginLibrary.buildPlugin(config));
})();
/*@end@*/