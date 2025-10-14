import fs from "fs";
import path from "path";
import vCard from "vcards-js";

export default {
  command: "getcontact",
  description: "Export all group members as VCF file",
  async handler(sock, m, args) {
    try {
      if (!m.key.remoteJid.endsWith("@g.us")) {
        await sock.sendMessage(m.key.remoteJid, { text: "❌ This command only works in groups." });
        return;
      }

      // Get group metadata
      const metadata = await sock.groupMetadata(m.key.remoteJid);
      const participants = metadata.participants;

      if (!participants || participants.length === 0) {
        await sock.sendMessage(m.key.remoteJid, { text: "⚠️ No participants found." });
        return;
      }

      let vcfContent = "";

      for (let p of participants) {
        const number = p.id.split("@")[0];
        const name = p.notify || p.id.split("@")[0];

        const vcard = vCard();
        vcard.firstName = name;
        vcard.cellPhone = number;
        vcfContent += vcard.getFormattedString() + "\n";
      }

      // Save as VCF
      const filePath = path.join(process.cwd(), "group_contacts.vcf");
      fs.writeFileSync(filePath, vcfContent);

      // Send file back
      await sock.sendMessage(m.key.remoteJid, {
        document: fs.readFileSync(filePath),
        fileName: "group_contacts.vcf",
        mimetype: "text/vcard",
      }, { quoted: m });

    } catch (err) {
      console.error("❌ Error in getcontact:", err);
      await sock.sendMessage(m.key.remoteJid, { text: "⚠️ Failed to export contacts." });
    }
  },
};
