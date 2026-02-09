// pluginManager.js

class PluginManager {
    constructor() {
        this.plugins = {};
    }

    // Method to register a plugin
    registerPlugin(name, plugin) {
        if (this.plugins[name]) {
            throw new Error(`Plugin ${name} is already registered.`);
        }
        this.plugins[name] = plugin;
        console.log(`Plugin ${name} registered successfully.`);
    }

    // Method to install a plugin
    install(name) {
        const plugin = this.plugins[name];
        if (!plugin) {
            throw new Error(`Plugin ${name} is not registered.`);
        }
        if (typeof plugin.install !== 'function') {
            throw new Error(`Plugin ${name} does not have an install method.`);
        }
        return plugin.install();
    }
}

// Example usage:
// const pluginManager = new PluginManager();
// pluginManager.registerPlugin('examplePlugin', { install: () => console.log('Example Plugin Installed!') });
// pluginManager.install('examplePlugin');

module.exports = PluginManager;