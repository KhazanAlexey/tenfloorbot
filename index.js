const TelegramApi = require('node-telegram-bot-api');
const moment = require('moment-timezone');
const schedule = require('node-schedule');
const variants = require("./const");
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramApi(token, { polling: true });

let scheduledJob = {};
let voteReminder = {};

const startPoll = async (chatId) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const options = { weekday: 'long', day: 'numeric', month: 'numeric' };
    const formattedDate = tomorrow.toLocaleDateString('ru-RU', options);

    const question = `((c) @AlexeyGrom )Выберите вариант обеда на завтра (${formattedDate}):`;
    await bot.sendPoll(chatId, question, [variants.var1, variants.var2, variants.var3], { is_anonymous: false });
};

const schedulePoll = (chatId) => {
    const minskTimeForPoll = '23:06';
    const minskTimeForReminder = '23:07';

    const serverTimeForPoll = moment.tz(minskTimeForPoll, 'HH:mm', 'Europe/Minsk').tz(moment.tz.guess()).format('HH:mm').split(':');
    const serverTimeForReminder = moment.tz(minskTimeForReminder, 'HH:mm', 'Europe/Minsk').tz(moment.tz.guess()).format('HH:mm').split(':');
console.log({serverTimeForPoll,serverTimeForReminder})
    scheduledJob[chatId] = schedule.scheduleJob(`0 ${serverTimeForPoll[1]} ${serverTimeForPoll[0]} * * 2,3`, async () => {
        await startPoll(chatId);
    });
    voteReminder[chatId] = schedule.scheduleJob(`0 ${serverTimeForReminder[1]} ${serverTimeForReminder[0]} * * 2,3`, async () => {
        await bot.sendMessage(chatId, "Пожалуйста, пройдите опрос по обедам, если опроса нет, напомните администратору выполнить команду /obed@ten_floor_bot.");
    });
};

const getNextPollTime = (chatId) => {
    if (scheduledJob[chatId]) {
        const nextInvocation = scheduledJob[chatId].nextInvocation();
        moment.locale('ru');
        console.log('nextInvocation)',nextInvocation)
        console.log('moment(nextInvocation)',moment(new Date(nextInvocation)))
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

const start = async () => {
    await bot.setMyCommands([
        { command: '/start', description: 'Запустить автоматическое создание опрсов по средам и четвергам в 10.00' },
        { command: '/obed', description: 'Запустить опрос по обедам прямо сейчас единожды' },
        { command: '/cancel_obed', description: 'Отменить автоматический запуск опроса' },
        { command: '/when_next_obed', description: 'Узнать время следующего опроса' }
    ]);

    bot.on('message', async msg => {
        const text = msg.text;
        const chatId = msg.chat.id;

        try {
            const restrictedCommands = ['/start@ten_floor_bot', '/obed@ten_floor_bot', '/cancel_obed@ten_floor_bot'];
            if (restrictedCommands.includes(text)) {
                const chatMember = await bot.getChatMember(chatId, msg.from.id);
                const isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
                const isAllowedUser = msg.from.username === 'AlexeyGrom'|| msg.from.username === 'anna_rudak';

                if (!isAdmin && !isAllowedUser) {
                    return bot.sendMessage(chatId, `Прости ${msg.from.first_name}, эта команда доступна только администраторам.`);
                }
            }

            if (text === '/start@ten_floor_bot') {
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

            if (text === '/when_next_obed@ten_floor_bot') {
                const nextPollTime = getNextPollTime(chatId);
                return bot.sendMessage(chatId, `Следующий опрос запланирован на: ${nextPollTime}`);
            }

        } catch (e) {
            return bot.sendMessage(chatId, 'Произошла какая то ошибочка!)');
        }
    });
};

start();
