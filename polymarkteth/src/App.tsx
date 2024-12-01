import BigNumber from "bignumber.js";
import { useEffect, useState } from "react";
import {
  Abi,
  Account,
  Address,
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  parseEther,
  PublicClient,
  UrlRequiredError,
  WalletClient,
} from "viem";
import "./App.css";

import { etherlinkTestnet } from "viem/chains";
import { extractErrorDetails } from "./DecodeEvmTransactionLogsArgs";

const CONTRACT_ADDRESS = "0xe2F903f3eBd77b7EC347932Ce5E53AD1961Eb002" as const;

type Bet = {
  id: bigint;
  owner: Address;
  option: string;
  amount: bigint; //wei
};

//crap copy pasta from Solidity code
enum BET_RESULT {
  WIN = 0,
  DRAW = 1,
  PENDING = 2,
}

export default function App() {
  const [abi, setAbi] = useState<any[]>([]);

  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [publicClient, setPublicClient] = useState<PublicClient | null>(null);
  const [address, setAddress] = useState<`0x${string}` | null>(null);

  const [balance, setBalance] = useState<bigint>(BigInt(0));

  const [error, setError] = useState("");

  const [betKeys, setBetKeys] = useState<bigint[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [fees, setFees] = useState<number>(0);
  const [status, setStatus] = useState<BET_RESULT>(BET_RESULT.PENDING);
  const [winner, setWinner] = useState<string | undefined>();

  const [options, setOptions] = useState<Map<string, bigint>>(new Map());

  const Ping = () => {
    const ping = async () => {
      try {
        if (!walletClient?.account) {
          console.error("No account", walletClient?.account);
          return;
        }

        const { request } = await publicClient!.simulateContract({
          account: walletClient?.account!,
          address: CONTRACT_ADDRESS,
          abi,
          functionName: "ping",
          args: [],
        });

        const result = await walletClient!.writeContract(request);
        console.log("result", result);

        setError("");
      } catch (error) {
        console.error("ERROR", error);
        setError(
          typeof error === "string"
            ? error
            : (error as Error).message + "\n" + (error as Error).stack
        );
      }
    };

    return (
      <span style={{ alignContent: "center", paddingLeft: 100 }}>
        <button onClick={ping}>Ping </button>
        {!error || error === "" ? <>&#128994;</> : <>&#128308;</>}
      </span>
    );
  };

  const loadStorage = async (abi: Abi) => {
    try {
      if (!walletClient?.account) {
        console.error("No account", walletClient?.account);
        return;
      }

      const status = (await publicClient!.readContract({
        address: CONTRACT_ADDRESS,
        abi,
        functionName: "status",
        args: [],
      })) as BET_RESULT;
      setStatus(status);
      console.log("status", status);

      const winner = (await publicClient!.readContract({
        address: CONTRACT_ADDRESS,
        abi,
        functionName: "winner",
        args: [],
      })) as string | undefined;
      setWinner(winner);
      console.log("winner", winner);

      const fees = (await publicClient!.readContract({
        address: CONTRACT_ADDRESS,
        abi,
        functionName: "FEES",
        args: [],
      })) as bigint;
      setFees(Number(fees) / 100);
      console.log("fees", fees);

      const betKeys = (await publicClient!.readContract({
        address: CONTRACT_ADDRESS,
        abi,
        functionName: "getBetKeys",
        args: [],
      })) as bigint[];
      setBetKeys(betKeys);
      console.log("betKeys", betKeys);

      const bets: Bet[] = await Promise.all(
        betKeys.map(
          async (betKey) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESS,
              abi,
              functionName: "getBets",
              args: [betKey],
            }) as Promise<Bet>
        )
      );

      setBets(bets);
      console.log("bets", bets);

      let newOptions = new Map();
      setOptions(newOptions);
      bets.forEach((bet) => {
        if (newOptions.has(bet.option)) {
          newOptions.set(bet.option, newOptions.get(bet.option)! + bet.amount); //acc
        } else {
          newOptions.set(bet.option, bet.amount);
        }
      });
      setOptions(newOptions);
      console.log("options", newOptions);
    } catch (error) {
      const errorParsed = extractErrorDetails(error, abi);
      setError(errorParsed.message);
    }
  };

  useEffect(() => {
    (async () => {
      if (address) {
        setBalance(
          await publicClient!.getBalance({
            address,
          })
        );

        const abi = await (await fetch("Polymarkteth.json")).json();
        // console.log("abi", abi.abi);
        setAbi(abi.abi);

        await loadStorage(abi.abi);
      } else {
        console.log("Address is null");
      }
    })();
  }, [address]);

  async function connectWallet() {
    // Check if ethereum object exists (browser wallet like MetaMask)
    if (window.ethereum) {
      try {
        // Request account access
        const accounts = (await window.ethereum.request({
          method: "eth_requestAccounts",
        })) as NonNullable<Account[]> | undefined;

        if (accounts && accounts.length > 0) {
          // Create wallet client
          const walletClient = createWalletClient({
            account: accounts[0],
            chain: etherlinkTestnet,
            transport: custom(window.ethereum),
          });

          // Create public client
          const publicClient = createPublicClient({
            chain: etherlinkTestnet,
            transport: http(),
          });

          // Get connected accounts
          const [address] = await walletClient.getAddresses();

          setAddress(address);
          setWalletClient(walletClient);
          setPublicClient(publicClient);
        } else {
          console.error("Cannot find accounts on the wallet");
        }
      } catch (error) {
        console.error("Wallet connection failed", error);
      }
    } else {
      console.error("No Ethereum wallet found");
    }
  }

  async function disconnectWallet() {
    setAddress(null);
  }

  const BetFunction = () => {
    const [amount, setAmount] = useState<BigNumber>(BigNumber(0)); //in Ether decimals
    const [option, setOption] = useState("trump");

    const runFunction = async () => {
      try {
        if (!walletClient?.account) {
          console.error("No account", walletClient?.account);
          return;
        }

        const { request } = await publicClient!.simulateContract({
          account: walletClient?.account!,
          address: CONTRACT_ADDRESS,
          abi,
          functionName: "bet",
          args: [option, parseEther(amount.toString(10))],
          value: parseEther(amount.toString(10)),
        });

        const hash = await walletClient!.writeContract(request);

        // Check transaction receipt
        const receipt = await publicClient!.getTransactionReceipt({
          hash,
        });

        //wait for tx to be included on a block
        const tx = await publicClient!.waitForTransactionReceipt({ 
          hash
        })

        console.log("Transaction Details:",tx);

        await loadStorage(abi);

        setError("");
      } catch (error) {
        const errorParsed = extractErrorDetails(error, abi);
        setError(errorParsed.message);
      }
    };

    const calculateOdds = (option: string, amount?: bigint): BigNumber => {

      //check option exists
      if(!options.has(option))return new BigNumber(0);

      console.log(
        "actuel",
        options && options.size > 0
          ? new BigNumber(options.get(option)!.toString()).toString()
          : 0,
        "total",
        new BigNumber(
          [...options.values()]
            .reduce((acc, newValue) => acc + newValue, amount ? amount : 0n)
            .toString()
        ).toString()
      );

      return options && options.size > 0
        ? new BigNumber(options.get(option)!.toString(10))
            .plus(
              amount ? new BigNumber(amount.toString(10)) : new BigNumber(0)
            )
            .div(
              new BigNumber(
                [...options.values()]
                  .reduce(
                    (acc, newValue) => acc + newValue,
                    amount ? amount : 0n
                  )
                  .toString(10)
              )
            )
            .plus(1)
            .minus(fees)
        : new BigNumber(0);
    };

    return (
      <span style={{ alignContent: "center", width: "100%" }}>
        {status && status === BET_RESULT.PENDING ? (
          <>
            <h3>Choose candidate</h3>

            <select
              name="options"
              onChange={(e) => setOption(e.target.value)}
              value={option}
              defaultValue="trump"
            >
              <option value="trump">Donald Trump</option>
              <option value="harris">Kamala Harris</option>
            </select>
            <h3>Amount</h3>
            <input
              type="number"
              id="amount"
              name="amount"
              required
              onChange={(e) => {
                if (e.target.value && !isNaN(Number(e.target.value))) {
                  //console.log("e.target.value",e.target.value)
                  setAmount(new BigNumber(e.target.value));
                }
              }}
            />

            <hr />
            {address ? <button onClick={runFunction}>Bet</button> : ""}

            <table style={{ fontWeight: "normal", width: "100%" }}>
              <tr>
                <td style={{ textAlign: "left" }}>Avg price (decimal)</td>
                <td style={{ textAlign: "right" }}>
                  {options && options.size > 0
                    ? calculateOdds(option, parseEther(amount.toString(10)))
                        .toFixed(3)
                        .toString()
                    : 0}
                </td>
              </tr>

              <tr>
                <td style={{ textAlign: "left" }}>Potential return</td>
                <td style={{ textAlign: "right" }}>
                  XTZ{" "}
                  {amount
                    ? calculateOdds(option, parseEther(amount.toString(10)))
                        .multipliedBy(amount)
                        .toFixed(6)
                        .toString()
                    : 0}{" "}
                  (
                  {options && options.size > 0
                    ? calculateOdds(option, parseEther(amount.toString(10)))
                        .minus(new BigNumber(1))
                        .multipliedBy(100)
                        .toFixed(2)
                        .toString()
                    : 0}
                  %)
                </td>
              </tr>
            </table>
          </>
        ) : (
          <>
            <span style={{ color: "#2D9CDB", fontSize: "1.125rem" }}>
              Outcome: {BET_RESULT[status]}
            </span>
            {winner ? <div style={{ color: "#858D92" }}>{winner}</div> : ""}
          </>
        )}
      </span>
    );
  };

  const resolve = async (option: string) => {
    try {
      if (!walletClient?.account) {
        console.error("No account", walletClient?.account);
        return;
      }

      const { request } = await publicClient!.simulateContract({
        account: walletClient?.account!,
        address: CONTRACT_ADDRESS,
        abi,
        functionName: "resolveResult",
        args: [option, BET_RESULT.WIN],
      });

      const hash = await walletClient!.writeContract(request);

      // Check transaction receipt
      const receipt = await publicClient!.getTransactionReceipt({
        hash,
      });

      console.log("Transaction Details:", {
        hash: hash,
        isValidHash: hash && hash.startsWith("0x") && hash.length === 66,
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      });

      await loadStorage(abi);

      setError("");
    } catch (error) {
      const errorParsed = extractErrorDetails(error, abi);
      setError(errorParsed.message);
    }
  };

  return (
    <>
      <header>
        <span style={{ display: "flex" }}>
          <h1>Polymarktez </h1>

          {!address ? (
            <button onClick={connectWallet}>Connect Wallet</button>
          ) : (
            <div style={{ alignContent: "flex-end", marginLeft: "auto" }}>
              Cash : XTZ {formatEther(balance)}
              <div className="chip">
                <img
                  src="https://cdn.britannica.com/66/226766-138-235EFD92/who-is-President-Joe-Biden.jpg?w=800&h=450&c=crop"
                  alt="Person"
                  width="96"
                  height="96"
                />
                {address}
              </div>
              <button onClick={disconnectWallet}>Disconnect Wallet</button>
            </div>
          )}
        </span>
      </header>

      <div id="content" style={{ display: "flex", paddingTop: 10 }}>
        <div style={{ width: "calc(66vw - 4rem)" }}>
          <span style={{ display: "flex" }}>
            <img
              style={{ width: "72px", paddingRight: 15 }}
              src="https://polymarket.com/_next/image?url=https%3A%2F%2Fpolymarket-upload.s3.us-east-2.amazonaws.com%2Fpresidential-election-winner-2024-afdda358-219d-448a-abb5-ba4d14118d71.png&w=1018&q=100"
            ></img>
            <h2>Presidential Election Winner 2024</h2>
          </span>
          <img style={{ width: "inherit" }} src="./graph.png"></img>

          <hr />

          <table style={{ width: "inherit" }}>
            <tr>
              <th>Outcome</th>
              <th>% chance</th>
              <th>action</th>
            </tr>
            {options && options.size > 0
              ? [...options.entries()].map(([option, amount]) => (
                  <tr key={option}>
                    <td className="tdTable">
                      <div className="picDiv">
                        <img
                          style={{ objectFit: "cover", height: "inherit" }}
                          src={"./" + option + ".webp"}
                        ></img>
                      </div>
                      {option}
                    </td>
                    <td>
                      {new BigNumber(amount.toString())
                        .div(
                          new BigNumber(
                            [...options.values()]
                              .reduce((acc, newValue) => acc + newValue, 0n)
                              .toString()
                          )
                        )
                        .multipliedBy(100)
                        .toFixed(2)}
                      %
                    </td>

                    <td>{status && status === BET_RESULT.PENDING ? 
                      <button onClick={() => resolve(option)}>Winner</button>: ""}
                    </td>
                  </tr>
                ))
              : ""}
          </table>
        </div>

        <div
          style={{
            width: "calc(33vw - 4rem)",
            boxShadow: "",
            margin: "1rem",
            borderRadius: "12px",
            border: "1px solid #344452",
            padding: "1rem",
          }}
        >
          <span className="tdTable">
            <BetFunction />
          </span>
        </div>
      </div>

      <footer>
        <h3>Errors</h3>

        <textarea
          readOnly
          rows={10}
          style={{ width: "100%" }}
          value={error}
        ></textarea>

        {address ? <Ping /> : ""}
      </footer>
    </>
  );
}
