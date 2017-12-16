// This loads the environment variables from the .env file
require('dotenv-extended').load();

const builder = require('botbuilder');
const restify = require('restify');
const WtoN = require('words-to-num');
const spellService = require('./spell-service');

// Setup Restify Server
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`${server.name} listening to ${server.url}`);
});
// Create connector and listen for messages
const connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
server.post('/api/messages', connector.listen());


// Default store: volatile in-memory store - Only for prototyping!
var inMemoryStorage = new builder.MemoryBotStorage();
var bot = new builder.UniversalBot(connector, function (session) {
    session.send('Sorry, I did not understand \'%s\'. Type \'help\' if you need assistance.', session.message.text);
}).set('storage', inMemoryStorage); // Register in memory storage


// You can provide your own model by specifing the 'LUIS_MODEL_URL' environment variable
// This Url can be obtained by uploading or creating your model from the LUIS portal: https://www.luis.ai/
const recognizer = new builder.LuisRecognizer(process.env.LUIS_MODEL_URL);
bot.recognizer(recognizer);

bot.dialog('CalculateAlcohol', (session, args) => {
    session.endDialog(`how much of what alcohol have you drunk ?`);
    console.log(session.privateConversationData);
}).triggerAction({
    matches: 'CalculateAlcohol'
});

bot.dialog('AlcoholList', (session, args) => {
    if(session.privateConversationData.alcohol_list == null) {
        session.privateConversationData.alcohol_list = {};
    }

    const numbers = builder.EntityRecognizer.findAllEntities(args.intent.entities, 'builtin.number');
    const alcohol = builder.EntityRecognizer.findAllEntities(args.intent.entities, 'Alcohol');
    console.log(numbers);
    console.log(alcohol);
    if ((numbers && alcohol) && numbers.length == alcohol.length) {
        // city entity detected, continue to next step
        numbers.forEach(function (element, index) {
            session.privateConversationData.alcohol_list[alcohol[index].entity] = WtoN.convert(element.entity);
        });
        session.save();
        session.endDialog(`Is that all?`);
    }else{
        builder.Prompts.text(session, 'Please enter your alcohols more clearly.');
    }
}).triggerAction({
    matches: 'AlcoholList'
});

bot.dialog('Completed', (session, args) => {
    var output = "So you have ";
    Object.keys(session.privateConversationData.alcohol_list).map(e => output += (`${session.privateConversationData.alcohol_list[e]}x${e} `));
    session.send(output);
    session.endDialog(`Ok you are totally drunk.`);
    session.privateConversationData.alcohol_list = {};
    session.save();
}).triggerAction({
    matches: 'Completed'
});

bot.dialog('Help', session => {
    session.endDialog(`Hi! Try asking me things like 'how drunk am i ?' or just name alcohols you drunk`);
}).triggerAction({
    matches: 'Help'
});


// Spell Check
if (process.env.IS_SPELL_CORRECTION_ENABLED === 'true') {
    bot.use({
        botbuilder: (session, next) => {
            spellService
                .getCorrectedText(session.message.text)
                .then(text => {
                    session.message.text = text;
                    next();
                })
                .catch(error => {
                    console.error(error);
                    next();
                });
        }
    });
}