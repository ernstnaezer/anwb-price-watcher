# ANWB Dynamic Energy Pricing Alert

This project provides code to monitor today's prices of [ANWB Energie](https://www.anwb.nl/huis/energie/anwb-energie). ANWB Energie is a dynamic pricing contract, so power and gas prices vary per day / hour. You can view the current prices in this handy [graph](https://energie.anwb.nl/actuele-tarieven).

Prices are updated every morning around 6am for the next 24hr. A CRON job pulls their API and pushes out a Slack alerts when prices are too high for your taste, allowing you time to turn off stuff and pull out an extra sweater for the day ⛄️.

## How to DID 🛠️
To host this code for yourself, you'll need a [Slack](https://slack.com), setup [Web hook integrations](https://api.slack.com/messaging/webhooks) and sign up for [repeat.dev](https://repeat.dev). Given the low volume of repeats and messages, all should be free.

Once you have your accounts and channel integration ready, the following steps should get you going: 

1. Have your Slack Web hook URL ready
2. Login to [repeat.dev](https://repeat.dev) and create a `new Repeat` using the `CRON job` template
3. Copy `cron.ts` from this repository into the editor
4. Click on the `Events` tab and select the interval. 
    1. Use the circle to enter my 6:30 am CRON schedule `30 6 * * *`
5. Click on the `Variables` tab and add the following
    1. `powerThreshold`, the power price (number) per kWh to trigger the alert, for example 1.0
    2. `gasThreshold`, the gas price (number) per m3 to trigger the alert, for example 1.45
    3. `slackUrl`, your Web hook URL (I have this encrypted)
6. Press the green `Deploy` button

### Test run 💪🏻

For a test run, set the price thresholds to 0, hit Play ▶️ and watch the `‼️ ANWB price Alert ‼️` message appear in your Slack.
