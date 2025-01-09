const TelegramApi = require('node-telegram-bot-api');
const moment = require('moment-timezone')
const schedule = require('node-schedule');
const variants = require("./const");
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramApi(token, {polling: true});

let scheduledJob = {}
let voteReminder={}

const startPoll = async (chatId) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const options = { weekday: 'long', day: 'numeric', month: 'numeric' };
    const formattedDate = tomorrow.toLocaleDateString('ru-RU', options);

    const question = `Выберите вариант обеда на завтра (${formattedDate}):`;
    await bot.sendPoll(chatId, question, [ variants.var1, variants.var2, variants.var3], { is_anonymous: false });
}

const schedulePoll = (chatId) => {

    // '*/1 * * * *'
    // 0 11 * * 3,5
    scheduledJob[chatId] = schedule.scheduleJob('00 10 * * 2,4', async () => {
        await startPoll(chatId);
    });
    voteReminder[chatId] = schedule.scheduleJob('00 13 * * 2,4', async () => {
            await bot.sendMessage(chatId, "Пожалуйста, пройдите опрос по обедам, если опроса нет, напомните администратору выполнить команду /obed@ten_floor_bot.");
    });

}


const getNextPollTime = (chatId) => {
    console.log(scheduledJob);
    if (scheduledJob[chatId]) {
        const nextInvocation = scheduledJob[chatId].nextInvocation();
        moment.locale('ru');
        const minskTime = moment(new Date(nextInvocation)).tz('Europe/Minsk').format('dddd, YYYY-MM-DD HH:mm:ss');
        return `${minskTime}`
    }
    return 'Опрос не запланирован. выполните /start@ten_floor_bot для автоматического запуска опроса по расписанию';
}

const cancelNextPoll = (chatId) => {
    if (scheduledJob[chatId]) {
        scheduledJob[chatId].cancel();
        scheduledJob[chatId] = null;
    }
    if (voteReminder[chatId]) {
        scheduledJob[chatId].cancel();
        scheduledJob[chatId] = null;
    }
}

const start = async () => {

    await bot.setMyCommands([
        {command: '/start', description: 'Запустить автоматическое создание опрсов по средам и четвергам в 10.00'},
        {command: '/obed', description: 'Запустить опроса по обедам прямо сейчас единожды'},
        {command: '/cancel_obed', description: 'Отменить автоматичевский запуск опроса'},
        {command: '/when_next_obed', description: 'Узнать время следующего опроса'}
    ]);

    bot.on('message', async msg => {
        const text = msg.text;
        const chatId = msg.chat.id;

        try {
            const restrictedCommands = ['/start@ten_floor_bot', '/obed@ten_floor_bot', '/cancel_obed@ten_floor_bot'];
            if (restrictedCommands.includes(text)) {
                const chatMember = await bot.getChatMember(chatId, msg.from.id);
                const isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
                const isAllowedUser = msg.from.username === 'AlexeyGrom';

                if (!isAdmin && !isAllowedUser) {
                    return bot.sendMessage(chatId, `Прости ${msg.from.first_name}, эта команда доступна только администраторам и пользователю @AlexeyGrom.`);
                }
            }

            if (text === '/start@ten_floor_bot') {
                schedulePoll(chatId)
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
}

start();


