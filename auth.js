const { google } = require('googleapis');

const credentials = {
  "type": "service_account",
  "project_id": "digitren-0001",
  "private_key_id": "1cb4443f41ac3a15d71d11b0c12fe671e2923719",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCu/hTawGL5qWGV\nXcuyeeiq6SkXjVpklCVGpP/0jZdnbGF6cwyrsbncWr+DYZJFLXDbKCpdpwqt43oG\nNxIHatt2lyGfs7ivZUGpnX65GawVuS85xooN4/PnLhE3icK0lSkVlUTkl/Qq7i4b\nTulnWPMS4P7aCV4b8jJrg0YLuoXl+BYjnSbw9FCqsD0AKywFKIL/4UpjYr2bQKl0\nAE9dm/wW1zoRiEcUB55mm+8zr9aP0NROmZu1mEd1opTP+hkwmX+UhQrw57+/UEds\n4wjfreZb4Unhzm66ry3fpwcFfSwPU4VYv3R+p37ymxRCUTtGdlmEt6tdq1OXx2F/\njQqx1xfVAgMBAAECggEACJx2OEGJXVHJfIkuEe1P1sE8hW0uSo7DutM5yTYCglNi\nBJ2OvRA03jQVAokVopPW3uH+G7exndb41T92gqjufcp4HBzC9NadwZP/fWpW/oar\nXUN43bAe+3xX2ozL6QkCCY7b4gfcOxSXbj6W28ATzhUGVYJqgCON+Z5vHvqhxiw3\nMHS5OaWmpArV324ZccEqeaKcL7WbFuWRmVklVD1q4x277po7LGkYOlo1BFmTK9TZ\nWn3etiAHwW9ujyTEikAL7w//GkT9Tvt8KtYzouZ8T6REDxWcoqqYkeLe5oi7hBGL\n858RvLuJnHiFVgP6gG+4da/VYdrE8FY96dCRKEX44QKBgQC+iEvD3IUDX7kRp0Ri\nI4WZf6uztLfaJ2Bz/6SRms3N+ewbSunZ4AHG5/4H8IX0liTPu7S2zjBRx4j6mxI3\n4YBk+sGUl5YamD3I5xN3HT1+6Vc06xuK0LFjVrrckxlVw/1t3KtG9dg05l6pfJBR\n2MRjzGsXcKeVgxZGXxVLXvddKQKBgQDrHtt0MkqbB7Fms8sspDoxHgJ7bf1M/Omd\nm4NMS+ocm2aNU0RZJgfa31inoof8YGNKj03lxwokZdl2wfAU0zgMJRSnn2dtv2sm\nTl/YKU5BBHkeTXyyMz2YAtCjT2mguorgswINASC0p34UXVgW4VV9lfvX0gNw/pwh\nPA3HCUdOzQKBgQCOmELb2vZRiBph8+Vh7WPXdY1zeRT/1+h/6BuqPUk5lon2AyLx\nRI0P6CBeoMwgOR5juf+NsNLI4aTKqbQAzmvhJyopoylbzgSvjwEqbF/R06DIogyC\n351i004WNqEHZx8MUdJ90RB2xtKh1e/M0YZpilu7tzw00V6iXBb7yZ8nwQKBgBIR\nMPPg2XLISI2Hy1kG1aHomHA7p3c/CASgapp2Susf1eWOPHZNQdVDzGA1URXHolmc\nYXQCs3jQisFhbb1r7aahQtEOorgAOY+b/ilyIx1D5rq5YZef8F+596ZU99zt+LYD\ni2jMaWL4a+vMsHQxpIwd9lhDPxhzuDOllblxsRURAoGADwV97do5HkqG7WSK499p\nRkZkwulPavzMM9UUkA9UxzZdscJDyEElgfHuhrRez+4GK382x6lPfNi4OwE6SxXD\nBxqHFDfzDsHkE3lmRaqW112oZUSL6GZZJ3XZXGHmHcoa9OieBrlilpop45/RZxfB\nGm/F9jffOeYNjm2sMIVJCMs=\n-----END PRIVATE KEY-----\n",
  "client_email": "google-sheets-api@digitren-0001.iam.gserviceaccount.com",
  "client_id": "102644176618884093532",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/google-sheets-api%40digitren-0001.iam.gserviceaccount.com",
};
const scopes = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file'
];
// Inisialisasi auth client
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: scopes,
});

module.exports = auth;
