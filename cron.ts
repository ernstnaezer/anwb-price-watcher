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

const fetchTodaysEnergyPrices = async (): Promise < {
    gas: PriceAggregate,
    power: PriceAggregate
} > => {

    enum EnergyType {
        Power = "1",
        Gas = "3"
    }

    const fetchPrices = async (type: EnergyType, fromDate: Date, tillDate: Date): Promise < Prices > => {
        const priceApi = new URL("https://api.energyzero.nl/v1/energyprices")

        priceApi.searchParams.append("fromDate", fromDate.toISOString());
        priceApi.searchParams.append("tillDate", tillDate.toISOString());
        priceApi.searchParams.append("inclBtw", "true");
        priceApi.searchParams.append("interval", "4");
        priceApi.searchParams.append("usageType", type);

        const result: any = await fetch(priceApi.href).then(r => r.json())
        return result.Prices.map((p: any): Price => {
            return {
                price: p.price,
                timeStamp: new Date(Date.parse(p.readingDate))
            }
        })
    }

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var tomorrow = new Date(today)
    tomorrow.setHours(24, 0, 0, 0);

    const gasPrices = await fetchPrices(EnergyType.Gas, today, tomorrow)
    const powerPrices = await fetchPrices(EnergyType.Power, today, tomorrow)

    const aggregate = (prices: Prices): PriceAggregate => {
        return {
            prices,
            highestPrice: prices.reduce((max, entry) => max.price > entry.price ? max : entry),
            lowestPrice: prices.reduce((max, entry) => max.price < entry.price ? max : entry),
            averagerPrice: prices.reduce((a, b) => (a + b.price), 0) / prices.length
        }
    }

    return {
        gas: aggregate(gasPrices),
        power: aggregate(powerPrices)
    }
}

const formatter = new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR'
})

export default {
    async cron(cron: Repeat.Cron, env: Repeat.Env): Promise < void > {
        try {
            console.log('running ANWB Energey Watch cron job');

            const gasThreshold: number = env.variables.gasThreshold
            const pwrThreshold: number = env.variables.powerThreshold

            const {
                gas,
                power
            } = await fetchTodaysEnergyPrices()

            console.log(`gas: high:${formatter.format(gas.highestPrice.price)} low:${formatter.format(gas.lowestPrice.price)}`)
            console.log(`power: high:${formatter.format(power.highestPrice.price)} low:${formatter.format(power.lowestPrice.price)}`)

            const priceMsg = (resource: string, unit: string, highestPrice: Price, threshold: number) => {
                return `${resource}: current: ${formatter.format(highestPrice.price)}/${unit}, threshold: ${formatter.format(threshold)}/${unit}, timestamp: ${highestPrice.timeStamp.toLocaleString("nl-NL")}`
            }

            let gasAlert = gas.highestPrice.price > gasThreshold
            let pwrAlert = power.highestPrice.price > pwrThreshold

            let priceMessages: string[] = [
                priceMsg("gas", "m3", gas.highestPrice, gasThreshold),
                priceMsg("power", "kWh", power.highestPrice, pwrThreshold)
            ]

            if (gasAlert || pwrAlert) {
                let msg = `?????? ANWB price alert??????  --- ${priceMessages.join(', ')}`
                env.webhooks.slack(env.variables.slackUrl, msg)
                console.log(msg)
            } else {
                console.log("no price alert")
            }

            // push out an alive message on first day of each month
            if(new Date().getDate() === 1) {
                let msg = `ANWB monthly ping  --- ${priceMessages.join(', ')}`
                env.webhooks.slack(env.variables.slackUrl, msg);
                console.log(msg);
            }

            // track prices and success
            env.metrics.write('gas.high', gas.highestPrice.price, "highest");
            env.metrics.write('gas.low', gas.lowestPrice.price, "lowest");
            env.metrics.write('power.high', power.highestPrice.price, "highest");
            env.metrics.write('power.low', power.lowestPrice.price, "lowest");
            
            env.metrics.write('cron_processed', 1, 'success');

        } catch (e) {
            // log error
            let msg = `cron failed!: ${e.message}`
            console.error(msg, e);
            env.webhooks.slack(env.variables.slackUrl, msg);

            // track failure
            env.metrics.write('cron_processed', 1, 'failure');
        }
    },
};
