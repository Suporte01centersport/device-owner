using System.Drawing;
using System.Windows.Forms;

namespace UEMAgent;

public class PasswordPromptForm : Form
{
    private readonly TextBox _passwordTextBox;

    public string EnteredPassword => _passwordTextBox.Text;

    public PasswordPromptForm()
    {
        Text = "Confirmar encerramento";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(360, 160);
        Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

        var descriptionLabel = new Label
        {
            Text = "Informe a senha de administrador para encerrar o agente.",
            AutoSize = false,
            Location = new Point(15, 15),
            Size = new Size(330, 40)
        };
        Controls.Add(descriptionLabel);

        var passwordLabel = new Label
        {
            Text = "Senha:",
            Location = new Point(15, 65),
            AutoSize = true
        };
        Controls.Add(passwordLabel);

        _passwordTextBox = new TextBox
        {
            Location = new Point(70, 60),
            Size = new Size(250, 27),
            UseSystemPasswordChar = true
        };
        Controls.Add(_passwordTextBox);

        var confirmButton = new Button
        {
            Text = "Confirmar",
            DialogResult = DialogResult.OK,
            Location = new Point(150, 105),
            Size = new Size(90, 30)
        };
        Controls.Add(confirmButton);

        var cancelButton = new Button
        {
            Text = "Cancelar",
            DialogResult = DialogResult.Cancel,
            Location = new Point(245, 105),
            Size = new Size(90, 30)
        };
        Controls.Add(cancelButton);

        AcceptButton = confirmButton;
        CancelButton = cancelButton;
    }
}


