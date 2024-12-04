#!/usr/bin/env node

// Импорт библиотек
import { Cell, Address, TonClient } from "@ton/ton";
import { Blockchain, createShardAccount } from "@ton/sandbox";
import { TupleItemInt } from "@ton/core";
import moment, { Moment } from "moment";
import crypto from "crypto";
import fs from "fs/promises";
import axios from "axios";
import {
  BlockID,
  LiteClient,
  LiteEngine,
  LiteRoundRobinEngine,
  LiteSingleEngine,
} from "ton-lite-client";
import * as dotenv from "dotenv";

// Загружаем переменные окружения
dotenv.config();

interface Asset {
  name: string;
  address: string;
  key: bigint;
  digits: number;
}

const mainPoolAssets: Asset[] = [
    { name: "TON", address: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c", key: 11876925370864614464799087627157805050745321306404563164673853337929163193738n, digits: 9 },
    { name: "stTON", address: "EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k", key: 33171510858320790266247832496974106978700190498800858393089426423762035476944n, digits: 9 },
    { name: "jUSDT", address: "EQB-MPwrd1G6WKNkLz_VnV6WqBDd142KMQv-g1O-8QUA3728", key: 81203563022592193867903899252711112850180680126331353892172221352147647262515n, digits: 6 },
    { name: "jUSDC", address: "EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA", key: 59636546167967198470134647008558085436004969028957957410318094280110082891718n, digits: 6 },
    { name: "tsTON", address: "EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav", key: 23103091784861387372100043848078515239542568751939923972799733728526040769767n, digits: 9 },
    { name: "USDt", address: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", key: 91621667903763073563570557639433445791506232618002614896981036659302854767224n, digits: 6 }
  ];
  
const lpPoolAssets: Asset[] = [
    { name: "TON", address: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c", key: 11876925370864614464799087627157805050745321306404563164673853337929163193738n, digits: 9 },
    { name: "USDt", address: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", key: 91621667903763073563570557639433445791506232618002614896981036659302854767224n, digits: 6 },
    { name: "USDT_STORM", address: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", key: 48839312865341050576546877995196761556581975995859696798601599030872576409489n, digits: 9 },
    { name: "TON_STORM", address: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", key: 70772196878564564641575179045584595299167675028240038598329982312182743941170n, digits: 9 },
    { name: "TONUSDT_DEDUST", address: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", key: 101385043286520300676049067359330438448373069137841871026562097979079540439904n, digits: 9 }
];

// Выбираем пул и адрес
const pool = process.env.pool || "main";
const assets: Asset[] = pool === "main" ? mainPoolAssets : lpPoolAssets;
const mainAddress = "EQC8rUZqR_pWV1BylWUlPNBzyiTYVoBEmQkMIQDZXICfnuRr";
const lpAddress = "EQBIlZX2URWkXCSg3QF2MJZU-wC5XkBoLww-hdWk2G37Jc6N";
const accountAddress: string = pool === "main" ? mainAddress : lpAddress;

// Инициализация клиента
let TON_LITE_CLIENT: LiteClient | undefined;

async function initLiteClient() {
  const response: any = await fetch("https://ton.org/global.config.json");
  const config = await response.json();
  const engines: LiteEngine[] = [];
  for (const server of config.liteservers) {
    const ip = intToIP(server.ip);
    const port = server.port;
    const publicKey = Buffer.from(server.id.key, "base64");
    const engine = new LiteSingleEngine({
      host: `tcp://${ip}:${port}`,
      publicKey,
    });
    engines.push(engine);
  }
  const engine: LiteEngine = new LiteRoundRobinEngine(engines);
  return new LiteClient({ engine });
}

function intToIP(int: number): string {
  const part1 = int & 255;
  const part2 = (int >> 8) & 255;
  const part3 = (int >> 16) & 255;
  const part4 = (int >> 24) & 255;
  return `${(part4 + 256) % 256}.${(part3 + 256) % 256}.${(part2 + 256) % 256}.${
    (part1 + 256) % 256
  }`;
}

async function processDate(date: Moment): Promise<{ code: Cell; data: Cell } | undefined> {
  const fromTime = date.unix();
  const blockHeader = await TON_LITE_CLIENT!.lookupBlockByUtime({
    shard: "80",
    workchain: -1,
    utime: fromTime,
  });
  const state = await getStateForBlock(Address.parseFriendly(accountAddress).address, blockHeader.id);
  return { code: state.code, data: state.data };
}

async function getStateForBlock(address: Address, block: BlockID): Promise<{ code: Cell; data: Cell }> {
  const result = await TON_LITE_CLIENT!.getAccountState(address, block);
  const state = Cell.fromBoc(result.raw)[0].beginParse();
  const code = state.loadRef();
  const data = state.loadRef();
  return { code, data };
}

async function writeToFile(filename: string, content: string): Promise<void> {
  try {
    await fs.writeFile(filename, content);
    console.log("File created!");
  } catch (err) {
    console.error("Failed to write file:", err);
  }
}

async function main() {
  TON_LITE_CLIENT = await initLiteClient();
  const startDate = moment(process.env.start);
  const endDate = moment(process.env.end);
  const address = Address.parse(accountAddress);

  let result_reseves: Record<string, any>[] = [];
  let result_tvl: Record<string, any>[] = [];
  let currentDate = startDate;

  while (currentDate <= endDate) {
    const blockchain = await Blockchain.create();
    blockchain.now = currentDate.unix();

    const state = await processDate(currentDate);
    if (!state) {
      currentDate = currentDate.add(1, "days");
      continue;
    }

    const code = state.code;
    const data = state.data;

    await blockchain.setShardAccount(address, createShardAccount({
      address,
      code,
      data,
      balance: 100000000000n,
      workchain: -1,
    }));

    console.log("Account set successfully ", currentDate);

    const provider = blockchain.provider(address, { code, data });
    const temp_reserves: Array<[number, string]> = [];
    const temp_tvl: Array<[number, number, string]> = [];

    for (const asset of assets) {
      try {
        let res;
        res = await provider.get("getAssetReserves", [{ type: "int", value: asset.key }]);
        const reserve = res.stack.readBigNumber();
        temp_reserves.push([Number(reserve) / 10 ** asset.digits, asset.name]);
        res = await provider.get("getAssetTotals", [{ type: "int", value: asset.key }]);
        const totalSupply = res.stack.readBigNumber();
        const totalBorrow = res.stack.readBigNumber();
        temp_tvl.push([
            Number(totalSupply) / 10 ** asset.digits,
            Number(totalBorrow) / 10 ** asset.digits,
            asset.name,
        ]);
      } catch (e) {
        console.warn("Unable to process " + asset.address);
      }
    }

    result_reseves.push({ [currentDate.unix()]: temp_reserves });
    result_tvl.push({ [currentDate.unix()]: temp_tvl });
    currentDate = currentDate.add(1, "days");
  }

  await writeToFile(`reserves_${pool}.txt`, JSON.stringify(result_reseves));
  await writeToFile(`tvl_${pool}.txt`, JSON.stringify(result_tvl));
  await TON_LITE_CLIENT.engine.close();
}

main().catch((err) => console.error("An error occurred:", err));
