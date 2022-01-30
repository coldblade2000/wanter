import axios from "axios";
import winston from "winston";
import puppeteer from "puppeteer";
import fs from "fs"
import { inspect } from 'util'
import pid from 'process'



// Should infinite loop continue?
let continueLoop = true
//Simple function that does a thread sleep
const delay = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Watch blacklist, watches which are no longer being checked

const blacklist: Array<String> = []

const timezoned = () => {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/Bogota'
    });
}

//Winston logging configuration
const {combine, timestamp, label, printf} = winston.format;
const format = printf(({level, message, timestamp}) => {
    return `${timestamp} ${level}: ${message}`;
});

const logger = winston.createLogger({
    level: 'debug',
    format: combine(
        timestamp({format: timezoned}),
        format
    ),

    defaultMeta: {service: 'user-service'},
    transports: [
        //
        // - Write all logs with level `error` and below to `error.log`
        // - Write all logs with level `info` and below to `combined.log`
        //
        new winston.transports.File({filename: 'error.log', level: 'error'}),
        new winston.transports.File({filename: 'combined.log'}),
        new winston.transports.Console({
            level: 'debug',
            format: winston.format.combine(
                winston.format.colorize(),
                format
            )
        })
    ],
});

logger.info(`Program startup!`)
if (pid.pid) {
    logger.debug(`The PID used is: ${pid}`)
}

//Configuration file

let config: Array<Watch>;

const updateConfig = ()=>{
    try{
        config = JSON.parse(fs.readFileSync('watches.json', 'utf-8'));
    }catch (e){
        logger.warn("Couldn't parse configuration file.")
    }
}
updateConfig()

const triggerNotification = async (watch: Watch, trigger: Trigger, value: number, response: puppeteer.HTTPResponse) => {
    logger.info(`A change has been detected! The watch ${watch.name} has been triggered by the '${trigger.selector}' trigger. ` +
    `The value found was ${value} instead of ${trigger.idleNumber}`)

    let success_send = false;
    let tryCount = 0;
    while (!success_send && tryCount < 5) {
        tryCount++;
        logger.debug(`The response status: ${response.status()}`)
        try {
            const req = await axios.get(" https://maker.ifttt.com/trigger/tickets_available/with/key/fk_yuNrWbkYnfjeyFx59PPZRcInK69jTUL7eght8yXh", {params: {
                value1: watch.name
                }})
            logger.info(`Call sent! Status: ${req.status}`)
            logger.debug(`Data: ${JSON.stringify(req.data, Object.getOwnPropertyNames(req.data))}`)
            success_send = 200 <= req.status && req.status < 300 // Was request successful?

        } catch (e) {
            logger.error("An error has occurred when calling user. Error contents: " + JSON.stringify(inspect(e), Object.getOwnPropertyNames(inspect(e))))
        }
        if (tryCount < 5) {
            if (!success_send) {
                await delay(3000)
            }
        } else {
            logger.warn(`Watch ${watch.name} suffered a timeout, and had 5 failed attempt to contact user.`)
        }
    }

    if (success_send) {
        blacklist.push(watch.name)
    }
    return success_send
}

const main = async () =>{
    const browser = await puppeteer.launch({
        headless: true,
        args: []
    });
    const page = await browser.newPage();
    // Infinite loop that checks webpage infinitely and triggers certain actions if
    while (continueLoop) {
        updateConfig()
        if (config !== undefined) {
            for (let watch of config) {
                if (blacklist.indexOf(watch.name) === -1) {
                    try {
                        // Loading the webpage and parsing it
                        let response = await page.goto(watch.url);

                        // Check each trigger of the watch
                        for (let trigger of watch.triggers) {
                            await page.waitForTimeout(1500)
                            let elements = await page.$$(trigger.selector)
                            let elementCount = elements.length
                            logger.debug(`${trigger.selector} trigger for the watch '${watch.name}' got a 
                        value of ${elementCount}, with expected value of ${trigger.idleNumber}`);

                            if (elementCount !== trigger.idleNumber && response.status() === 200) {
                                // A trigger was fired!
                                triggerNotification(watch, trigger, elementCount, response)
                            }

                        }
                    } catch (e) {
                        logger.warn(`An error has occurred when getting data from watch '${watch.name}'. 
                    Error contents: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`)
                    }

                }
            }
        }
        await delay(25_000 + ((Math.random() - 0.5) * 10_000))
    }
}

main()


