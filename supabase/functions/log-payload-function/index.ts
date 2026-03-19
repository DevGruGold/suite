export default async (req: Request) => {
  console.log("log-payload-function received payload:", await req.json());
  return new Response("Payload logged!", { status: 200 });
}