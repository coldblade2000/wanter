"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = __importDefault(require("cheerio"));
const winston_1 = __importDefault(require("winston"));
const fs_1 = __importDefault(require("fs"));
const util_1 = require("util");
// Should infinite loop continue?
let continueLoop = true;
//Simple function that does a thread sleep
const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
// Watch blacklist, watches which are no longer being checked
const blacklist = [];
const timezoned = () => {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/Bogota'
    });
};
//Winston logging configuration
const { combine, timestamp, label, printf } = winston_1.default.format;
const format = printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
});
const logger = winston_1.default.createLogger({
    level: 'debug',
    format: combine(timestamp({ format: timezoned }), format),
    defaultMeta: { service: 'user-service' },
    transports: [
        //
        // - Write all logs with level `error` and below to `error.log`
        // - Write all logs with level `info` and below to `combined.log`
        //
        new winston_1.default.transports.File({ filename: 'error.log', level: 'error' }),
        new winston_1.default.transports.File({ filename: 'combined.log' }),
        new winston_1.default.transports.Console({
            level: 'debug',
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), format)
        })
    ],
});
logger.info(`Program startup!`);
//Configuration file
let config;
const updateConfig = () => {
    try {
        config = JSON.parse(fs_1.default.readFileSync('watches.json', 'utf-8'));
    }
    catch (e) {
        logger.warn("Couldn't parse configuration file.");
    }
};
updateConfig();
const triggerNotification = async (watch, trigger, value, response) => {
    logger.info(`A change has been detected! The watch ${watch.name} has been triggered by the '${trigger}' trigger. 
    The value found was ${value} instead of ${trigger.idleNumber}`);
    let success_send = false;
    let tryCount = 0;
    while (!success_send && tryCount < 5) {
        tryCount++;
        logger.debug(`The response status: ${response.status}`);
        try {
            const req = await axios_1.default.get(" https://maker.ifttt.com/trigger/tickets_available/with/key/fk_yuNrWbkYnfjeyFx59PPZRcInK69jTUL7eght8yXh", { params: {
                    value1: watch.name
                } });
            logger.info(`Call sent! Status: ${req.status}`);
            logger.debug(`Data: ${JSON.stringify(req.data, Object.getOwnPropertyNames(req.data))}`);
            success_send = 200 <= req.status && req.status < 300; // Was request successful?
        }
        catch (e) {
            logger.error("An error has occurred when calling user. Error contents: " + JSON.stringify((0, util_1.inspect)(e), Object.getOwnPropertyNames((0, util_1.inspect)(e))));
        }
        if (tryCount < 5) {
            if (!success_send) {
                await delay(3000);
            }
        }
        else {
            logger.warn(`Watch ${watch.name} suffered a timeout, and had 5 failed attempt to contact user.`);
        }
    }
    if (success_send) {
        blacklist.push(watch.name);
    }
    return success_send;
};
const main = async () => {
    // Infinite loop that checks webpage infinitely and triggers certain actions if
    while (continueLoop) {
        updateConfig();
        if (config !== undefined) {
            for (let watch of config) {
                if (blacklist.indexOf(watch.name) === -1) {
                    try {
                        // Loading the webpage and parsing it
                        let response = await axios_1.default.get(watch.url);
                        let htmlContent = response.data;
                        let $ = cheerio_1.default.load(htmlContent);
                        // Check each trigger of the watch
                        for (let trigger of watch.triggers) {
                            let elementCount = $(trigger.selector).length;
                            logger.debug(`${trigger.selector} trigger for the watch '${watch.name}' got a 
                        value of ${elementCount}, with expected value of ${trigger.idleNumber}`);
                            if (elementCount !== trigger.idleNumber && response.status === 200) {
                                // A trigger was fired!
                                triggerNotification(watch, trigger, elementCount, response);
                            }
                        }
                    }
                    catch (e) {
                        logger.warn(`An error has occurred when getting data from watch '${watch.name}'. 
                    Error contents: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
                    }
                }
            }
        }
        await delay(25000 + ((Math.random() - 0.5) * 10000));
    }
};
main();
