const TelegramApi = require('node-telegram-bot-api');
const moment = require('moment-timezone');
const schedule = require('node-schedule');
const variants = require("./const");

const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI("AIzaSyDEpA0G-pXtmWJKFP9FUYM1rGrFgbSmn6g");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramApi(token, { polling: true });

let scheduledJob = {};
let voteReminder = {};
let chatHistory = {};

const minskTimeForPoll = '9:45';
const minskTimeForReminder = '14:00';

const mainMenuKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: 'Полезные ссылки' }]
        ],
        resize_keyboard: true
    }
};

const usefulLinksKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: 'Confluence IT Help', url: 'https://confluence.aventus.work/display/IT/Workspace+setup' }],
            [{ text: 'PeopleForce', url: 'https://aventusit.peopleforce.io/dashboards' }],
            [{ text: 'Компенсация', url: 'https://payoff.1c.avgr.it/ru/' }],
            [{ text: 'Jira', url: 'https://jira.aventus.work/secure/Dashboard.jspa' }]
        ]
    }
};

const startPoll = async (chatId) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const options = { weekday: 'long', day: 'numeric', month: 'numeric' };
    const formattedDate = tomorrow.toLocaleDateString('ru-RU', options);

    const question = `Выберите вариант обеда на завтра (${formattedDate}):`;
    await bot.sendPoll(chatId, question, [variants.var1, variants.var2, variants.var3], { is_anonymous: false });
};

const schedulePoll = (chatId) => {
    cancelNextPoll(chatId);

    const serverTimeForPoll = moment.tz(minskTimeForPoll, 'HH:mm', 'Europe/Minsk').tz(moment.tz.guess()).format('HH:mm').split(':');
    const serverTimeForReminder = moment.tz(minskTimeForReminder, 'HH:mm', 'Europe/Minsk').tz(moment.tz.guess()).format('HH:mm').split(':');

    scheduledJob[chatId] = schedule.scheduleJob(`0 ${serverTimeForPoll[1]} ${serverTimeForPoll[0]} * * 2,4`, async () => {
        await startPoll(chatId);
    });
    voteReminder[chatId] = schedule.scheduleJob(`0 ${serverTimeForReminder[1]} ${serverTimeForReminder[0]} * * 2,4`, async () => {
        await bot.sendMessage(chatId, `Пожалуйста, пройдите опрос по обедам. Опрос был опрубликован сегодня в ${minskTimeForPoll}`);
    });
};

const getNextPollTime = (chatId) => {
    if (scheduledJob[chatId]) {
        const nextInvocation = scheduledJob[chatId].nextInvocation();
        moment.locale('ru');

        const minskTime = moment(new Date(nextInvocation)).tz('Europe/Minsk').format('dddd, YYYY-MM-DD HH:mm:ss');
        return `${minskTime}`;
    }
    return 'Опрос не запланирован. выполните /start@ten_floor_bot для автоматического запуска опроса по расписанию';
};

const cancelNextPoll = (chatId) => {
    if (scheduledJob[chatId]) {
        scheduledJob[chatId].cancel();
        scheduledJob[chatId] = null;
    }
    if (voteReminder[chatId]) {
        voteReminder[chatId].cancel();
        voteReminder[chatId] = null;
    }
};

const sendWelcomeMessage = async (chatId, username) => {
    const welcomeText = `Привет${username ? `, ${username}` : ''}! 👋\nЯ бот, живу на Тучинский перулок 2а. Чем могу помочь?`;
    await bot.sendMessage(chatId, welcomeText, mainMenuKeyboard);
};

const getAllScheduledPolls = () => {
    const allSchedules = {};
    for (const [chatId, job] of Object.entries(scheduledJob)) {
        if (job) {
            const nextInvocation = job.nextInvocation();
            if (nextInvocation) {
                allSchedules[chatId] = {
                    nextPoll: moment(new Date(nextInvocation)).tz('Europe/Minsk').format('YYYY-MM-DD HH:mm:ss'),
                    reminder: voteReminder[chatId] ? moment(new Date(voteReminder[chatId].nextInvocation())).tz('Europe/Minsk').format('YYYY-MM-DD HH:mm:ss') : 'Не установлено'
                };
            }
        }
    }
    return allSchedules;
};

const handleAdminScheduleView = async (msg) => {
    const chatId = msg.chat.id;

    if (msg.chat.type === 'private' &&
        msg.text === '/admin_schedule' &&
        msg.from.username === 'AlexeyGrom') {

        const schedules = getAllScheduledPolls();

        if (Object.keys(schedules).length === 0) {
            return bot.sendMessage(chatId, 'Нет активных запланированных опросов.');
        }

        let message = '📊 *Запланированные опросы по всем чатам:*\n\n';

        for (const [groupId, schedule] of Object.entries(schedules)) {
            try {
                const chat = await bot.getChat(groupId);
                message += `*Чат:* ${chat.title || groupId}\n`;
                message += `├ Следующий опрос: ${schedule.nextPoll}\n`;
                message += `└ Напоминание: ${schedule.reminder}\n\n`;
            } catch (error) {
                message += `*Чат ID:* ${groupId}\n`;
                message += `├ Следующий опрос: ${schedule.nextPoll}\n`;
                message += `└ Напоминание: ${schedule.reminder}\n\n`;
            }
        }

        return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
};


const handleSpeakOutCommand = async (chatId) => {
    const TEN_MINUTES = 7 * 60 * 1000; // 7 minutes in milliseconds
    const messages = chatHistory[chatId] || [];

    // Filter messages
    const filteredMessages = [];
    for (let i = 0; i < messages.length - 1; i++) {
        const currentMessage = messages[i];
        const nextMessage = messages[i + 1];

        const timeDifference = new Date(nextMessage.timestamp).getTime() - new Date(currentMessage.timestamp).getTime();
        const containsBotCommand = currentMessage?.message?.includes('/') || currentMessage?.message?.includes('@NewCustom0Bot') || currentMessage?.message?.includes('@ten_floor_bot');

        if (timeDifference <= TEN_MINUTES && !containsBotCommand) {
            filteredMessages.push(currentMessage);
        }
    }

    const context = filteredMessages.map(entry => `${entry.timestamp} - ${entry.message}`).join('\n');

    // const result = await model.generateContent(`${context} Продолжи диалог от своего имени, отвечай не соблюдая формат диалога, не используй 'я:'`);
    //
    //   bot.sendMessage(chatId, result.response.text());

    botSay(chatId,context)
};

const botSay =async (chatId,message) => {
    const result = await model.generateContent(`${message} Продолжи диалог от своего имени, отвечай не соблюдая формат диалога, не используй 'я:'`);

    bot.sendMessage(chatId, result.response.text());
}


const start = async () => {
    await bot.deleteMyCommands({ scope: { type: 'all_private_chats' } });

    await bot.setMyCommands([
        { command: '/start', description: `Запустить автоматическое создание опросов по средам и четвергам в ${minskTimeForPoll}` },
        { command: '/obed', description: 'Запустить опрос по обедам прямо сейчас единожды' },
        { command: '/cancel_obed', description: 'Отменить автоматический запуск опроса' },
        { command: '/when_next_obed', description: 'Узнать время следующего опроса' },
        { command: '/say', description: 'Попросить бота высказаться' }
    ], { scope: { type: 'all_group_chats' } });

    bot.on('message', async msg => {
        const text = msg.text;
        const chatId = msg.chat.id;

        if (!chatHistory[chatId]) {
            chatHistory[chatId] = [];
        }

        // Exclude messages with photos, videos, or animations
        if (msg.photo || msg.video || msg.animation) {
            return;
        }
        // Convert Unix timestamp to human-readable format
        const timestamp = moment.unix(msg.date).format('YYYY-MM-DD HH:mm:ss');
        const userName = msg.from.username || msg.from.first_name;
        chatHistory[chatId].push({ message: `${userName}: ${text}`, timestamp });

        // Keep only the last 20 messages
        if (chatHistory[chatId].length > 30) {
            chatHistory[chatId].shift();
        }
        try {
            await handleAdminScheduleView(msg);

            if (msg.chat.type === 'private') {
                if (text === '/start') {
                    return sendWelcomeMessage(chatId, msg.from.first_name);
                }

                if (text === 'Полезные ссылки') {
                    return bot.sendMessage(chatId, 'Список полезных ссылок:', usefulLinksKeyboard);
                }

                return bot.sendMessage(chatId, 'Выберите опцию:', mainMenuKeyboard);
            }

            if (msg?.reply_to_message?.from?.username==='NewCustom0Bot'||
                msg?.reply_to_message?.from?.username==='ten_floor_bot'||
                text.startsWith('@ten_floor_bot') || text.startsWith('@NewCustom0Bot')) {
                return botSay(chatId,text);
            }

            if (text === '/say@ten_floor_bot' || text === '/say@NewCustom0Bot') {
                return handleSpeakOutCommand(chatId, text);
            }

            const restrictedCommands = ['/start@ten_floor_bot', '/obed@ten_floor_bot', '/cancel_obed@ten_floor_bot'];
            if (restrictedCommands.includes(text)) {
                const chatMember = await bot.getChatMember(chatId, msg.from.id);
                const isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
                const isAllowedUser = msg.from.username === 'AlexeyGrom';

                if (!isAdmin && !isAllowedUser) {
                    return bot.sendMessage(chatId, `Прости ${msg.from.first_name}, эта команда доступна только администраторам.`);
                }
            }

            if (text === '/start@ten_floor_bot' || text === "/start@NewCustom0Bot") {
                schedulePoll(chatId);
                const nextPollTime = getNextPollTime(chatId);
                return bot.sendMessage(chatId, `Автоматический опрос запущен. Следующий опрос запланирован на: ${nextPollTime}`);
            }

            if (text === '/obed@ten_floor_bot') {
                bot.sendMessage(chatId, `Опрос был запущен: ${msg.from.first_name}`);
                return startPoll(chatId);
            }

            if (text === '/cancel_obed@ten_floor_bot') {
                cancelNextPoll(chatId);
                return bot.sendMessage(chatId, 'Запуск опроса по расписанию отменен.');
            }

            if (text === '/when_next_obed@ten_floor_bot' || text === '/when_next_obed@NewCustom0Bot') {
                const nextPollTime = getNextPollTime(chatId);
                return bot.sendMessage(chatId, `Следующий опрос запланирован на: ${nextPollTime}`);
            }

        } catch (e) {
            return bot.sendMessage(chatId, 'Я устал, поговорим завтра!)');
        }
    });
};

start();
