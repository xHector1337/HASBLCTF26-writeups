import { CORRECT_LINEUP } from "../../../lineup";

export async function POST(request) {
  const body = await request.json();
  const { lineup } = body;

  if (!lineup) {
    return Response.json({ success: false, message: "No lineup provided." }, { status: 400 });
  }

  const positions = ["GK", "RB", "CB1", "CB2", "LB", "CDM1", "CDM2", "CAM", "RW", "LW", "ST"];

  for (const pos of positions) {
    if (!lineup[pos]) {
      return Response.json({ success: false, message: `Position ${pos} is empty.` }, { status: 400 });
    }
  }

  const normalize = (s) => s.trim().toLowerCase();

  for (const pos of positions) {
    if (normalize(lineup[pos]) !== normalize(CORRECT_LINEUP[pos])) {
      return Response.json({ success: false, message: "Incorrect lineup. Keep trying!" }, { status: 200 });
    }
  }

  const flag = process.env.CTF_FLAG || "CTF{d3fault_fl4g_s3t_y0ur_0wn}";

  return Response.json({ success: true, flag }, { status: 200 });
}
