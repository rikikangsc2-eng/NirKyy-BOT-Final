import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export async function loadCommands() {
    const commands = new Map();
    const commandFoldersPath = path.join(process.cwd(), 'src', 'commands');

    try {
        const categoryFolders = fs.readdirSync(commandFoldersPath);

        for (const category of categoryFolders) {
            const categoryPath = path.join(commandFoldersPath, category);
            if (!fs.statSync(categoryPath).isDirectory()) continue;

            const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                const fileUrl = pathToFileURL(filePath);

                const commandModule = await import(fileUrl);
                const command = commandModule.default;

                if (command && command.name) {
                    command.category = category;
                    commands.set(command.name, command);
                }
            }
        }
        console.log(`Berhasil nge-load ${commands.size} command. Mantap!`);
        return commands;
    } catch (error) {
        console.error("Anjir, Gagal nge-load commands:", error);
        return new Map();
    }
}