require("dotenv").config();
import { AggregateError, Op } from "sequelize";
import { City, UrlModel } from "./types/model";
import {
  getAllPromisesResults,
  getUrl,
  sendMessageToSlack,
} from "./utils/utils";
import { logger as mainLogger } from "./config";
import {
  getFilteredPages,
  processInBatches,
  scrapAndInsertData,
} from "./scrap_helper";
import { lastAdded } from "./queries";

const logger = mainLogger.child({ file: "index" });

const PROPERTY_TYPES = ["Homes", "Plots", "Commercial"];
const PROPERTY_PURPOSE = ["Buy", "Rent"];
const CITIES = ["Islamabad-3", "Karachi-2", "Lahore-1", "Rawalpindi-41"];

const BATCH_SIZE = 20;

(async () => {
  try {
    console.time("Start scraping and inserting data");
    {
      await City.bulkCreate(
        CITIES.map((c) => ({ name: c.split("-")[0] })) as any,
        {
          ignoreDuplicates: true,
          returning: ["id", "name"],
        }
      );
      const cityModels = await City.findAll({
        where: {
          name: {
            [Op.in]: CITIES.map((c) => c.split("-")[0]),
          },
        },
        attributes: ["id", "name"],
      });

      const citiesMap = {} as Record<string, number>;
      const citiesLastAddedMap = {} as Record<number, Promise<any>>;

      cityModels.forEach((city) => {
        const cityKey = CITIES.find((c) => c.startsWith(city.name));
        citiesLastAddedMap[city.id] = lastAdded(city.id);
        if (cityKey) citiesMap[cityKey] = city.id;
      });

      const pages = CITIES.map((city) =>
        PROPERTY_TYPES.map((propertyType) =>
          PROPERTY_PURPOSE.map((purpose) =>
            getUrl(propertyType, city, purpose, citiesMap[city])
          )
        )
      ).flat(2);
      logger.info(`Pages :: ${pages.length}`);
      const filteredPages = await getAllPromisesResults(
        pages.map((p) => getFilteredPages(p, citiesLastAddedMap))
      );

      await UrlModel.bulkCreate(
        filteredPages.flat(1).map((p) => ({ ...p, city_id: p.cityId })) as any,
        {
          ignoreDuplicates: true,
          returning: false,
          logging: false,
        }
      );
      logger.info("Urls inserted successfully");
    }

    await processInBatches();
    logger.info(`Scraping completed successfully`);

    logger.info("Adding data to Properties table");
    await scrapAndInsertData(BATCH_SIZE);
    logger.info("Data added to Properties table successfully");
  } catch (err) {
    logger.error(err);
    let errorMessage = "";
    if (err instanceof AggregateError) {
      errorMessage = err.errors.map((e) => e.message).join(", ");
    } else if (err instanceof Error) {
      errorMessage = err.message;
    } else {
      errorMessage = JSON.stringify(err);
    }
    await sendMessageToSlack(errorMessage);
  } finally {
    console.timeEnd("Start scraping and inserting data");
    await sendMessageToSlack();
  }
})().catch((err) => {
  logger.fatal(`Unhandled error: ${err.message}`, { error: err });
  process.exit(1);
});
