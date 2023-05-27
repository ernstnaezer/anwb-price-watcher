type Price = {
    price: number
    timeStamp: Date
}

type Prices = [Price]

type PriceAggregate = {
    prices: Prices
    highestPrice: Price
    lowestPrice: Price
    averagerPrice: number
}

const currency = new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR'
})

const shortTime = new Intl.DateTimeFormat("nl-NL", {
    timeStyle:'short'
})

function getReadableTimeslots(timestamps: Date[]): string {

    const timeStrings = timestamps.map( stamp => shortTime.format(stamp))

    if (timeStrings.length === 0) {
        return '';
    }

    // Sort the array first
    timeStrings.sort();

    // Convert times to hour numbers for easier manipulation
    const times: number[] = timeStrings.map(timeString => parseInt(timeString.split(':')[0], 10));

    let start = times[0];
    let end = start + 1;
    let slots: string[] = [];

    for (let i = 1; i < times.length; i++) {
        if (times[i] === end) {
            end++;  
        } else {
            slots.push(`between ${start}:00 and ${end}:00`);
            start = times[i];
            end = start + 1;
        }
    }

    slots.push(`between ${start}:00 and ${end}:00`);
    return slots.join(' and ');
}   

const delay = (milli:number = 1000) => new Promise( resolve => setTimeout(() => resolve(0), milli)) 

async function fetchWithRetry(input: string | Request, init?: RequestInit, retryCount: number = 5): Promise<Response> {
    try {
        return await fetch(input, init)
    } catch (error) {
        if (retryCount <= 0) {
            throw error
        }
        await delay(1000)
        return await fetchWithRetry(input, init, retryCount - 1)
    }
}

async function fetchTodaysEnergyPrices(): Promise<{ gas: PriceAggregate; electricity: PriceAggregate} > {

    enum EnergyType {
        Electricity = "1",
        Gas = "3"
    }

    async function fetchPrices(type: EnergyType, fromDate: Date, tillDate: Date): Promise<Prices> {
        const priceApi = new URL("https://api.energyzero.nl/v1/energyprices")

        priceApi.searchParams.append("fromDate", fromDate.toISOString())
        priceApi.searchParams.append("tillDate", tillDate.toISOString())
        priceApi.searchParams.append("inclBtw", "true")
        priceApi.searchParams.append("interval", "4")
        priceApi.searchParams.append("usageType", type)

        return fetchWithRetry(priceApi.href)
            .then(r => r.json())
            //.then(r => console.log(r))
            .then( (r:any) => r.Prices.map( (p:any) => {
                return {
                    price: p.price,
                    timeStamp: new Date(Date.parse(p.readingDate))
                }
            }))
            .catch(error => {
                throw Error(`failed fetching prices: ${error.message}`)
            })
    }

    var today = new Date()
    today.setHours(0, 0, 0, 0)

    var tomorrow = new Date(today)
    tomorrow.setHours(24, 0, 0, 0)

    const gasPrices = await fetchPrices(EnergyType.Gas, today, tomorrow)
    const electricityPrices = await fetchPrices(EnergyType.Electricity, today, tomorrow)

    function aggregate(prices: Prices): PriceAggregate {
        return {
            prices,
            highestPrice: prices.reduce((max, entry) => max.price > entry.price ? max : entry),
            lowestPrice: prices.reduce((max, entry) => max.price < entry.price ? max : entry),
            averagerPrice: prices.reduce((a, b) => (a + b.price), 0) / prices.length
        }
    }

    return {
        gas: aggregate(gasPrices),
        electricity: aggregate(electricityPrices)
    }
}

export default {
    async cron(cron: Repeat.Cron, env: Repeat.Env): Promise < void > {
        try {
            console.log('running ANWB Energey Watch cron job');

            const gasThreshold: number = parseFloat(env.variables.gasThreshold)
            const electricityThreshold: number = parseFloat(env.variables.electricityThreshold)
            const electricityFreeThreshold: number = parseFloat(env.variables.electricityFreeThreshold)

            const { gas, electricity } = await fetchTodaysEnergyPrices()

            console.log(`tresholds gas:${currency.format(gasThreshold)}, electricity:${currency.format(electricityThreshold)}, free electricity: ${currency.format(electricityFreeThreshold)}`)

            console.log(`gas: high:${currency.format(gas.highestPrice.price)} low:${currency.format(gas.lowestPrice.price)}`)
            console.log(`electricity: high:${currency.format(electricity.highestPrice.price)} low:${currency.format(electricity.lowestPrice.price)}`)

            let gasAlert = gas.highestPrice.price >= gasThreshold
            if(gasAlert) {
                let msg = `‼️ gas price ‼️ --- high: ${currency.format(gas.highestPrice.price)}/m3 at ${shortTime.format(gas.highestPrice.timeStamp)}, low: ${currency.format(gas.lowestPrice.price)}/m3 at ${shortTime.format(gas.lowestPrice.timeStamp)}`
                env.webhooks.slack(env.variables.slackUrl, msg)
                console.log(msg)
                await delay()
            }

            let electricityAlert = electricity.highestPrice.price >= electricityThreshold
            if(electricityAlert) {
                let msg = `‼️ electricity price ‼️ --- high:${currency.format(electricity.highestPrice.price)}/kWh at ${shortTime.format(electricity.highestPrice.timeStamp)}, low:${currency.format(electricity.lowestPrice.price)}/kWh at ${shortTime.format(electricity.lowestPrice.timeStamp)}`
                env.webhooks.slack(env.variables.slackUrl, msg)
                console.log(msg)
                await delay()
            }

            let freeElectricityHours = electricity.prices.filter(price => price.price <= electricityFreeThreshold)
            if(freeElectricityHours.length > 0) {
                let msg = `🤑 free electricity 🤑 --- ${getReadableTimeslots(freeElectricityHours.map( e => e.timeStamp))}`
                env.webhooks.slack(env.variables.slackUrl, msg)
                console.log(msg)
                await delay()
            }

            // push out an alive message on first day of each month
            if(new Date().getDate() === 1) {
                let msg = `⏰ monthly ping ⏰ 
--- gas: high: ${currency.format(gas.highestPrice.price)}/m3 at ${shortTime.format(gas.highestPrice.timeStamp)}, low: ${currency.format(gas.lowestPrice.price)}/m3 at ${shortTime.format(gas.lowestPrice.timeStamp)}
--- electricity: high:${currency.format(electricity.highestPrice.price)}/kWh at ${shortTime.format(electricity.highestPrice.timeStamp)}, low:${currency.format(electricity.lowestPrice.price)}/kWh at ${shortTime.format(electricity.lowestPrice.timeStamp)}`
                env.webhooks.slack(env.variables.slackUrl, msg);
                console.log(msg);
                await delay()
            }

            // track prices and success
            env.metrics.write('gas.high', gas.highestPrice.price, "highest");
            env.metrics.write('gas.low', gas.lowestPrice.price, "lowest");
            env.metrics.write('electricity.high', electricity.highestPrice.price, "highest");
            env.metrics.write('electricity.low', electricity.lowestPrice.price, "lowest");
            
            env.metrics.write('cron_processed', 1, 'success');

        } catch (error) {
            // log error
            let msg = `cron failed: ${error.message}`
            console.error(msg, error);
            env.webhooks.slack(env.variables.slackUrl, msg);

            // track failure
            env.metrics.write('cron_processed', 1, 'failure');
        }
    },
};
