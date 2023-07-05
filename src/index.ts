import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Client,
    Events,
    GatewayIntentBits,
    InteractionReplyOptions,
    REST,
    Routes,
    SlashCommandBuilder,
} from "discord.js";
import { config } from "dotenv";

config();

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
    throw new Error("No token provided");
}

const ID = process.env.ID;
if (!ID) {
    throw new Error("No ID provided");
}

type State = "開始" | "圖書館門口" | "櫃檯" | "廁所" | "馬桶" | "刷卡機" | "中控室" | "爆炸裝置";

interface Backpack {
    has_card: boolean;
    exploded: boolean;
}

type Act = [result: string, state: State | undefined, acts?: { check?: (u: Backpack) => boolean; modify?: (y: Backpack) => void }];

const machine: Record<State, Record<string, Act>> = {
    開始: {
        圖書館門口: ["你正在圖書館門口！你需要把圖書館炸掉！", "圖書館門口"],
    },
    圖書館門口: {
        櫃檯: ["你往櫃檯走了", "櫃檯"],
        廁所: ["你往廁所走了", "廁所"],
        刷卡機: [
            "你往刷卡機走了",
            "刷卡機",
            {
                check: (u) => u.has_card,
            },
        ],
    },
    櫃檯: {
        圖書館門口: ["你往圖書館門口走了", "圖書館門口"],
        廁所: ["你往廁所走了", "廁所"],
    },
    廁所: {
        圖書館門口: ["你往圖書館門口走了", "圖書館門口"],
        櫃檯: ["你往櫃檯走了", "櫃檯"],
        馬桶: [
            "你在馬桶發現了圖書館長掉落的卡片！",
            "馬桶",
            {
                modify: (u) => (u.has_card = true),
            },
        ],
    },
    馬桶: {
        廁所: ["你往廁所走了", "廁所"],
    },
    刷卡機: {
        圖書館門口: ["你往圖書館門口走了", "圖書館門口"],
        中控室: ["你往中控室走了", "中控室"],
    },
    中控室: {
        刷卡機: ["你往刷卡機走了", "刷卡機"],
        爆炸裝置: ["你在中控室發現了爆炸裝置！", "爆炸裝置"],
    },
    爆炸裝置: {
        中控室: ["你往中控室走了", "中控室"],
        啟動: [
            "圖書館爆炸了！你阻止了邪惡的陰謀！",
            undefined,
            {
                modify: (u) => (u.exploded = true),
            },
        ],
    },
};

const store = new Map<string, [State, Backpack]>();

export function build_message(user: [State, Backpack], action: string): InteractionReplyOptions {
    console.log({ user, action });
    const next_state = machine[user[0]][action][1];
    if (!(action in machine[user[0]])) {
        return {
            content: "你不能這樣做！",
            ephemeral: true,
        };
    }

    const midifier = machine[user[0]][action][2]?.modify;
    if (midifier) {
        midifier(user[1]);
    }

    if (next_state) {
        const next = machine[next_state];

        const buttons = new ActionRowBuilder<ButtonBuilder>();
        for (const [action, act] of Object.entries(next)) {
            if (act[2]?.check?.(user[1]) ?? true) {
                buttons.addComponents(new ButtonBuilder().setCustomId(action).setStyle(ButtonStyle.Primary).setLabel(action));
            }
        }

        const content = machine[user[0]][action][0];
        user[0] = next_state;

        return {
            content,
            components: [buttons],
            ephemeral: true,
        };
    } else {
        return {
            content: machine[user[0]][action][0],
            ephemeral: true,
        };
    }
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

client.on("ready", () => {
    console.log("Ready!");
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName: command, user } = interaction;
        if (command === "sm") {
            const key = user.id;
            const backpack = { has_card: false, exploded: false };
            const u = ["開始", backpack] as [State, Backpack];
            store.set(key, u);
            await interaction.reply(build_message(u, "圖書館門口"));
            return;
        }
    }

    if (interaction.isButton()) {
        const { customId: action, user } = interaction;
        const key = user.id;
        const u = store.get(key);
        if (!u) {
            await interaction.reply({
                content: "使用 /sm 開始遊戲！",
                ephemeral: true,
            });
            return;
        }

        await interaction.reply(build_message(u, action));
    }
});

client.login(TOKEN);

(async () => {
    try {
        const rest = new REST().setToken(TOKEN);

        console.log("Started refreshing application (/) commands.");

        await rest.put(Routes.applicationCommands(ID), {
            body: [new SlashCommandBuilder().setName("sm").setDescription("炸掉圖書館").toJSON()],
        });

        console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
        console.error(error);
    }
})();
